import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
path = 'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/AP_FORMAT_EMPTY.docx'

with zipfile.ZipFile(path) as z:
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find('.//w:body', ns)
    
    for tbl_idx, tbl in enumerate(body.findall('.//w:tbl', ns)):
        print(f"\n==================== TABLE {tbl_idx} ====================")
        tblBorders = tbl.find('.//w:tblBorders', ns)
        if tblBorders is not None:
            b_info = {b.tag.split('}')[-1]: b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for b in tblBorders}
            print("Table borders:", b_info)
        
        for r_idx, r in enumerate(tbl.findall('./w:tr', ns)):
            cells = r.findall('./w:tc', ns)
            row_out = []
            for c_idx, c in enumerate(cells):
                tcBorders = c.find('.//w:tcBorders', ns)
                borders = {}
                if tcBorders is not None:
                    for b in tcBorders:
                        borders[b.tag.split('}')[-1]] = (b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val'), b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sz'))
                w = c.find('.//w:tcW', ns)
                w_val = w.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w') if w is not None else ''
                text = ' // '.join(''.join(p.itertext()).strip() for p in c.findall('.//w:p', ns) if ''.join(p.itertext()).strip())
                row_out.append(f"C{c_idx}(w={w_val}, b={borders}): \"{text}\"")
            print(f"R{r_idx}: " + " | ".join(row_out))
