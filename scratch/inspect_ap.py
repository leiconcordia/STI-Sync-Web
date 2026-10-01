import zipfile
import xml.etree.ElementTree as ET
import sys

# Set stdout to utf-8 safe
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def inspect_doc(name):
    path = f'C:/VSCODE PROJECTS/STI SYNC WEB AND MOBILE/docs/{name}'
    print(f"\n=======================================================")
    print(f"DOCUMENT: {name}")
    print(f"=======================================================")
    with zipfile.ZipFile(path) as z:
        xml_content = z.read('word/document.xml')
        root = ET.fromstring(xml_content)
        body = root.find('.//w:body', ns)
        for i, child in enumerate(body):
            tag = child.tag.split('}')[-1]
            if tag == 'p':
                t = ''.join(child.itertext()).strip()
                if t:
                    print(f"P: {t}")
            elif tag == 'tbl':
                rows = child.findall('./w:tr', ns)
                print(f"Top-level Table with {len(rows)} rows:")
                for r_idx, r in enumerate(rows):
                    cells = r.findall('./w:tc', ns)
                    row_texts = []
                    for c in cells:
                        cell_p = [''.join(p.itertext()).strip() for p in c.findall('.//w:p', ns)]
                        cell_str = ' // '.join(p for p in cell_p if p)
                        row_texts.append(cell_str)
                    if any(row_texts):
                        print(f"  R{r_idx}: " + " | ".join(row_texts[:3]))

for d in ['Activity Proposal for Esports Cup local level.docx', 'AP2025 (1).docx', 'AP EVRAA.docx']:
    inspect_doc(d)
