import zipfile
import xml.etree.ElementTree as ET

ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

files = ['AP2025 (1).docx', 'Activity Proposal for Esports Cup local level.docx', 'AP EVRAA.docx']
for fname in files:
    with zipfile.ZipFile('../docs/' + fname) as z:
        xml_content = z.read('word/document.xml')
        root = ET.fromstring(xml_content)
        body = root.find('w:body', ns)
        fonts = set()
        sizes = set()
        for node in body.iter(f"{{{ns['w']}}}rPr"):
            rFonts = node.find(f"{{{ns['w']}}}rFonts")
            sz = node.find(f"{{{ns['w']}}}sz")
            if rFonts is not None:
                fonts.add(rFonts.attrib.get(f"{{{ns['w']}}}ascii"))
            if sz is not None:
                sizes.add(int(sz.attrib.get(f"{{{ns['w']}}}val")) / 2)
        print(f"=== {fname} ===")
        print("Fonts:", fonts)
        print("Sizes:", sorted(list(sizes)))
