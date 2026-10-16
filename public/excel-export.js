/* Dependency-free OOXML export. Text is written as inline strings, never formulas. */
(function () {
  'use strict';
  const encoder = new TextEncoder();
  const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  const column = index => { let name = ''; for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name; return name; };
  function cell(value, index, row, style = 0) {
    const ref = column(index) + row;
    if (value && typeof value === 'object' && 'formula' in value) return `<c r="${ref}" s="${value.style ?? style}"><f>${xml(value.formula)}</f><v>${Number(value.value) || 0}</v></c>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  function worksheet(rows, widths, merges, landscape = false, freeze = 0) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0">${freeze ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r,i)=>`<row r="${i+1}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>${r.values.map((v,j)=>cell(v,j,i+1,r.styles?.[j]??r.style??0)).join('')}</row>`).join('')}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(r=>`<mergeCell ref="${r}"/>`).join('')}</mergeCells>` : ''}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${landscape?'landscape':'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  const crcTable = Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
  function crc32(bytes) { let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0; }
  function zip(files) {
    const chunks=[],central=[];let offset=0,centralSize=0;
    for(const [name,content]of Object.entries(files)) {
      const filename=encoder.encode(name),data=encoder.encode(content),crc=crc32(data),local=new Uint8Array(30+filename.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(10,0,true);lv.setUint16(12,33,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,filename.length,true);local.set(filename,30);
      const entry=new Uint8Array(46+filename.length),cv=new DataView(entry.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);entry.set(filename,46);chunks.push(local,data);central.push(entry);offset+=local.length+data.length;centralSize+=entry.length;
    }
    const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function buildQuoteWorkbook(quote, translate = s=>s, language = 'en') {
    const tr=translate, summary=[],merges=[];
    const add=(values,style=0,height=22,styles)=>{summary.push({values,style,height,styles});return summary.length};
    const band=(text,style=0,height=24)=>{const r=add([text],style,height);merges.push(`A${r}:F${r}`);return r};
    band('SophiMotion',1,34);band(tr('Quote estimate'),2,30);
    add([tr('Date'),quote.createdAt.slice(0,10),'',tr('Currency'),'USD']);
    add([tr('Client'),quote.client.name]);merges.push('B4:F4');
    add([tr('Company'),quote.client.company]);merges.push('B5:F5');
    add([tr('Email'),quote.client.email]);merges.push('B6:F6');
    add([]);band(tr('Quote summary'),3,27);
    const subrow=add([tr('Components subtotal'),'','','','',{formula:`SUM(Components!L4:L${quote.parts.length+3})`,value:quote.subtotal,style:4}]);merges.push(`A${subrow}:E${subrow}`);
    const setuprow=add([tr('Setup fee'),'','','','',quote.setupFee],0,25,[0,0,0,0,0,4]);merges.push(`A${setuprow}:E${setuprow}`);
    const totalrow=add([tr('Estimated total'),'','','','',{formula:`F${subrow}+F${setuprow}`,value:quote.total,style:6}],2,32);merges.push(`A${totalrow}:E${totalrow}`);
    band(tr('USD · excludes tax & shipping'),7,23);add([]);
    band(tr('Notes'),3,26);band(quote.client.notes||'—',7,60);add([]);
    band(tr('Risk analysis'),3,27);
    for(const risk of quote.risks) {band((risk.warn?'! ':'✓ ')+tr(risk.title),8,24);band(tr(risk.desc),7,54);}
    add([]);band(tr('This is an estimate, not a confirmed manufacturing order.'),7,32);
    band(tr('Excel pricing note'),7,50);
    const details=[{values:[tr('Components')],style:1,height:32},{values:[tr('Density is in g/cm³; infill is a separate percentage.')],style:7,height:28},{values:['#',tr('Component'),tr('Material'),tr('Method'),tr('Density (g/cm³)'),tr('Infill (%)'),tr('Post-processing'),tr('Quantity'),tr('Volume (cm³)'),tr('Mass / unit (g)'),tr('Unit price (USD)'),tr('Line total (USD)'),tr('Mesh check'),tr('Notes')],style:3,height:40}];
    quote.parts.forEach((p,i)=>{const r=i+4;details.push({values:[i+1,p.name,tr(p.material),p.method,p.densityGPerCm3,p.infill,tr(p.postprocessing),p.quantity,p.volumeCm3,{formula:`I${r}*E${r}*IF(D${r}="FDM",0.15+0.85*F${r}/100,1)`,value:p.estimatedMassG,style:5},p.unitPrice,{formula:`ROUND(H${r}*K${r},2)`,value:p.lineTotal,style:4},p.sample?tr('SAMPLE MODEL'):p.meshIssues?tr('Mesh requires review'):tr('No mesh-edge issues detected'),p.sample?tr('Sample geometry only'):tr('Engineering review required')],styles:[0,0,0,0,5,0,0,0,5,5,4,4,7,7],height:42});});
    const dr=details.length+1;details.push({values:[tr('Components subtotal'),'','','','','','','','','','',{formula:`SUM(L4:L${dr-1})`,value:quote.subtotal,style:6}],style:2,height:30});
    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF15171C"/><name val="Arial"/></font><font><b/><sz val="20"/><color rgb="FF0057FF"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FF15171C"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0057FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9">${[{font:0},{font:1},{font:2,fill:3},{font:3,fill:2},{font:0,num:164},{font:0,num:165},{font:2,num:164,fill:3},{font:0},{font:2}].map(s=>`<xf numFmtId="${s.num||0}" fontId="${s.font}" fillId="${s.fill||0}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    return zip({
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${language==='zh-CN'?'报价':'Quote'}" sheetId="1" r:id="rId1"/><sheet name="Components" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml':styles,
      'xl/worksheets/sheet1.xml':worksheet(summary,[21,16,14,14,14,20],merges),
      'xl/worksheets/sheet2.xml':worksheet(details,[5,30,19,10,14,12,20,12,16,16,17,18,25,30],['A1:N1','A2:N2',`A${dr}:K${dr}`],true,3)
    });
  }
  window.buildQuoteWorkbook=buildQuoteWorkbook;
  window.downloadQuoteExcel=function(quote,translate,language){const blob=buildQuoteWorkbook(quote,translate,language),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SophiMotion-quote-'+quote.createdAt.slice(0,10)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
})();
