import zipfile
import xml.etree.ElementTree as ET
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def dump_document_text(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
        body = root.find('.//w:body', ns)
        for child in body:
            tag = child.tag.split('}')[-1]
            if tag == 'p':
                t = ' '.join(''.join(child.itertext()).split())
                if t:
                    print(f"[P] {t}")
            elif tag == 'tbl':
                print("[TABLE START]")
                for r in child.findall('./w:tr', ns):
                    cells = r.findall('./w:tc', ns)
                    row_data = []
                    for c in cells:
                        paras = [' '.join(''.join(p.itertext()).split()) for p in c.findall('.//w:p', ns)]
                        row_data.append(' \n  '.join(p for p in paras if p))
                    print("  | " + " | ".join(row_data))
                print("[TABLE END]")

dump_document_text('C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/AP2025 (1).docx')
