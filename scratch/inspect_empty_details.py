import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
path = 'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/AP_FORMAT_EMPTY.docx'

with zipfile.ZipFile(path) as z:
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find('.//w:body', ns)
    
    # Page setup
    sectPr = body.find('.//w:sectPr', ns)
    pgSz = sectPr.find('.//w:pgSz', ns)
    pgMar = sectPr.find('.//w:pgMar', ns)
    print("Page Size:", pgSz.attrib)
    print("Page Margins:", pgMar.attrib)
    
    tbl1 = root.findall('.//w:tbl', ns)[1]
    tblGrid = tbl1.find('.//w:tblGrid', ns)
    if tblGrid is not None:
        for col in tblGrid.findall('.//w:gridCol', ns):
            print("gridCol w:", col.attrib)
            
    # Check paragraph styles and spacing
    for p in body.findall('.//w:p', ns)[:10]:
        t = ''.join(p.itertext()).strip()
        pPr = p.find('.//w:pPr', ns)
        sp = pPr.find('.//w:spacing', ns) if pPr is not None else None
        sp_attrib = sp.attrib if sp is not None else {}
        if t:
            print(f"P '{t}': spacing={sp_attrib}")
