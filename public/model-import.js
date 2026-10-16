(function () {
  'use strict';
  const LIMIT = 150000;
  function validate(triangles) {
    if (!triangles.length) throw Error('No triangle surfaces found. Export a solid or mesh model.');
    if (triangles.length > LIMIT) throw Error('Model exceeds 150,000 triangles. Export a coarser mesh.');
    for (const triangle of triangles) for (const vertex of triangle) if (vertex.length !== 3 || vertex.some(n => !Number.isFinite(n))) throw Error('Invalid model coordinates.');
    return triangles;
  }
  function fromThree(root, filename, scale = 1) {
    const result = []; let count = 0;
    root.updateMatrixWorld(true);
    root.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      const g = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const position = g.attributes.position, index = g.index;
      const length = index ? index.count : position.count;
      if (length % 3) throw Error('Model does not contain triangle faces.');
      count += length / 3;
      if (count > LIMIT) throw Error('Model exceeds 150,000 triangles. Export a coarser mesh.');
      const triangles=[];
      for(let i=0;i<length;i+=3) triangles.push([0,1,2].map(k=>{const n=index?index.getX(i+k):i+k;return [position.getX(n)*scale,position.getY(n)*scale,position.getZ(n)*scale]}));
      result.push({name:object.name||filename,triangles:validate(triangles)});
      g.dispose();
    });
    // Quote geometry only: dispose materials/textures created by loaders.
    root.traverse(object=>{object.geometry?.dispose();for(const m of (Array.isArray(object.material)?object.material:[object.material]))if(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose?.()}});
    if(!result.length)throw Error('No triangle surfaces found. Export a solid or mesh model.');
    return result;
  }
  function cad(buffer, format) {
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('cad-worker.js',document.baseURI));
      const timer=setTimeout(()=>{worker.terminate();reject(Error('CAD conversion timed out. Export a simplified STEP or STL model.'))},90000);
      const finish=()=>{clearTimeout(timer);worker.terminate()};
      worker.onmessage=e=>{finish();if(e.data.error)return reject(Error(e.data.error));try{const objects=e.data.meshes.map(m=>{const a=new Float64Array(m.positions),triangles=[];for(let i=0;i<a.length;i+=9)triangles.push([[a[i],a[i+1],a[i+2]],[a[i+3],a[i+4],a[i+5]],[a[i+6],a[i+7],a[i+8]]]);return{name:m.name,triangles:validate(triangles)}});resolve(objects)}catch(error){reject(error)}};
      worker.onerror=e=>{e.preventDefault();finish();reject(Error('CAD importer could not load. Check your connection and try again.'))};
      worker.postMessage({buffer,format},[buffer]);
    });
  }
  window.import3DFile=async function(file,parseSTL){
    const ext=file.name.split('.').pop().toLowerCase(),buffer=await file.arrayBuffer();
    let objects,normalizedUnits=false;
    if(ext==='stl')objects=[{name:file.name,triangles:validate(parseSTL(buffer))}];
    else if(['step','stp','iges','igs','brep'].includes(ext)){objects=await cad(buffer,ext);normalizedUnits=ext!=='brep'}
    else if(ext==='obj'){
      const {OBJLoader}=await import('./vendor/three/examples/jsm/loaders/OBJLoader.js');
      objects=fromThree(new OBJLoader().parse(new TextDecoder().decode(buffer)),file.name);
    }else if(ext==='ply'){
      const [{PLYLoader},{Mesh,MeshBasicMaterial}]=await Promise.all([import('./vendor/three/examples/jsm/loaders/PLYLoader.js'),import('./vendor/three/build/three.module.js')]);
      const geometry=new PLYLoader().parse(buffer);
      if(!geometry.index)throw Error('PLY must contain faces; point clouds cannot be quoted.');
      objects=fromThree(new Mesh(geometry,new MeshBasicMaterial()),file.name);
    }else if(ext==='3mf'){
      const {unzipSync}=await import('./vendor/three/examples/jsm/libs/fflate.module.js');
      let size=0;
      const entries=unzipSync(new Uint8Array(buffer),{filter:file=>{size+=file.originalSize;if(size>100*1024*1024)throw Error('3MF expands beyond 100 MB. Export a simpler model.');return /\.model$|\.rels$/i.test(file.name)}});
      const parser=new DOMParser(),units={micron:.001,millimeter:1,centimeter:10,meter:1000,inch:25.4,foot:304.8};
      let scale=null;
      for(const [name,data]of Object.entries(entries))if(/\.model$/i.test(name)){
        const model=parser.parseFromString(new TextDecoder().decode(data),'application/xml');
        if(model.querySelector('parsererror'))throw Error('Invalid 3MF model XML.');
        const unit=model.documentElement.getAttribute('unit')||'millimeter';
        if(!(unit in units))throw Error('Unsupported 3MF units. Export in millimeters.');
        if(scale!==null&&scale!==units[unit])throw Error('Mixed-unit 3MF models are not supported. Export a millimeter 3MF.');
        scale=units[unit];
        for(const node of model.getElementsByTagName('*'))if(['beamlattice','slice','volumetricdata'].includes(node.localName.toLowerCase()))throw Error('This 3MF uses non-triangle geometry. Export a standard mesh 3MF or STEP.');
        const required=(model.documentElement.getAttribute('requiredextensions')||'').split(/\s+/).filter(Boolean);
        for(const prefix of required){const uri=model.documentElement.lookupNamespaceURI(prefix)||'';if(!/3dmanufacturing\/production\/2015\/06/.test(uri))throw Error('This 3MF requires an unsupported extension. Export standard mesh 3MF or STEP.');}
      }
      if(scale===null)throw Error('No 3MF model found.');
      // Geometry quotation does not need textures. Repack only model and relationship files.
      const {zipSync}=await import('./vendor/three/examples/jsm/libs/fflate.module.js');
      const {ThreeMFLoader}=await import('./vendor/three/examples/jsm/loaders/3MFLoader.js');
      const clean=zipSync(entries);objects=fromThree(new ThreeMFLoader().parse(clean.buffer),file.name,scale);normalizedUnits=true;
    }else throw Error('Unsupported geometry format. Use STL, STEP, IGES, BREP, OBJ, PLY or 3MF.');
    // BREP files may return one mesh per face; quote their combined shell as one part.
    if(ext==='brep'&&objects.length>1)objects=[{name:file.name,triangles:objects.flatMap(o=>o.triangles)}];
    if(objects.reduce((n,o)=>n+o.triangles.length,0)>LIMIT)throw Error('Model exceeds 150,000 triangles. Export a coarser mesh.');
    return {objects,format:ext.toUpperCase(),normalizedUnits};
  };
})();
