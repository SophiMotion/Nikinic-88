importScripts('vendor/occt/occt-import-js.js');
self.onmessage=async event=>{
  try{
    const occt=await occtimportjs({locateFile:name=>new URL('vendor/occt/'+name,self.location.href).href});
    const {format,buffer}=event.data;
    const read=['step','stp'].includes(format)?'ReadStepFile':['iges','igs'].includes(format)?'ReadIgesFile':'ReadBrepFile';
    const result=occt[read](new Uint8Array(buffer),{linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:.001,angularDeflection:.5});
    if(!result.success||!result.meshes?.length)throw Error('CAD file could not be converted. Export a valid solid STEP file from Fusion.');
    let count=0;
    const meshes=result.meshes.map(mesh=>{
      const positions=mesh.attributes.position.array,indices=mesh.index.array;
      count+=indices.length/3;if(count>150000)throw Error('CAD model exceeds 150,000 triangles. Export a simplified model.');
      const output=new Float64Array(indices.length*3);
      indices.forEach((index,i)=>{output[i*3]=positions[index*3];output[i*3+1]=positions[index*3+1];output[i*3+2]=positions[index*3+2]});
      return {name:mesh.name,positions:output.buffer};
    });
    self.postMessage({meshes},meshes.map(m=>m.positions));
  }catch(error){self.postMessage({error:error.message||'CAD import failed.'})}
};
