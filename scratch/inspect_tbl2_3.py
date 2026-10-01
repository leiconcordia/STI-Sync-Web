import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
path = 'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/AP_FORMAT_EMPTY.docx'

with zipfile.ZipFile(path) as z:
    root = ET.fromstring(z.read('word/document.xml'))
    tbl2 = root.findall('.//w:tbl', ns)[2]
    tbl3 = root.findall('.//w:tbl', ns)[3]
    
    print("=== TABLE 2 (TASK LIST) ===")
    for r_idx, r in enumerate(tbl2.findall('./w:tr', ns)):
        cells = r.findall('./w:tc', ns)
        c_info = []
        for c in cells:
            t = ''.join(c.itertext()).strip()
            tcb = c.find('.//w:tcBorders', ns)
            b = {}
            if tcb is not None:
                b = {x.tag.split('}')[-1]: x.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for x in tcb}
            c_info.append(f"'{t}' {b}")
        print(f"R{r_idx}: " + " | ".join(c_info))
        
    print("\n=== TABLE 3 (FINANCIAL PROJECTIONS) ===")
    for r_idx, r in enumerate(tbl3.findall('./w:tr', ns)):
        cells = r.findall('./w:tc', ns)
        c_info = []
        for c in cells:
            t = ''.join(c.itertext()).strip()
            tcb = c.find('.//w:tcBorders', ns)
            b = {}
            if tcb is not None:
                b = {x.tag.split('}')[-1]: x.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for x in tcb}
            c_info.append(f"'{t}' {b}")
        print(f"R{r_idx}: " + " | ".join(c_info))
