import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
path = 'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/AP_FORMAT_EMPTY.docx'

with zipfile.ZipFile(path) as z:
    root = ET.fromstring(z.read('word/document.xml'))
    tbl1 = root.findall('.//w:tbl', ns)[1]
    
    print("TABLE 1 (MAIN FORM) ROWS:")
    for r_idx, r in enumerate(tbl1.findall('./w:tr', ns)):
        cells = r.findall('./w:tc', ns)
        c0_t = ''.join(cells[0].itertext()).strip()
        c1_t = ''.join(cells[1].itertext()).strip()[:40]
        
        c0_b = {}
        tcb0 = cells[0].find('.//w:tcBorders', ns)
        if tcb0 is not None:
            c0_b = {b.tag.split('}')[-1]: b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for b in tcb0}
            
        c1_b = {}
        tcb1 = cells[1].find('.//w:tcBorders', ns)
        if tcb1 is not None:
            c1_b = {b.tag.split('}')[-1]: b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for b in tcb1}
            
        print(f"Row {r_idx:2d} | Label: '{c0_t:22s}' (borders: {c0_b}) | Content: '{c1_t}' (borders: {c1_b})")
