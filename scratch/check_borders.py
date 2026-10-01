import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def check_tables(name):
    print(f"\n==================== {name} ====================")
    path = f'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/{name}'
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
        body = root.find('.//w:body', ns)
        for tbl_idx, tbl in enumerate(body.findall('.//w:tbl', ns)):
            first_text = ''.join(tbl.itertext())[:60].strip()
            tblBorders = tbl.find('.//w:tblBorders', ns)
            b_info = {}
            if tblBorders is not None:
                b_info = {b.tag.split('}')[-1]: b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for b in tblBorders}
            
            # Check cell borders in row 0
            rows = tbl.findall('./w:tr', ns)
            r0_borders = []
            for c in rows[0].findall('./w:tc', ns):
                tcb = c.find('.//w:tcBorders', ns)
                if tcb is not None:
                    r0_borders.append({b.tag.split('}')[-1]: b.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') for b in tcb})
                else:
                    r0_borders.append('none')
            print(f"Table {tbl_idx} ({len(rows)} rows) - '{first_text}'")
            print(f"   Table-level borders: {b_info}")
            print(f"   Row 0 cell borders: {r0_borders}")

for d in ['AP_FORMAT_EMPTY.docx', 'AP IT Expert Talk 1.docx', 'AP2025 (1).docx']:
    check_tables(d)
