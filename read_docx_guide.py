import docx
import os

doc_path = r"C:\Users\llll\Documents\두인경매\주식투자\오픈API 활용자가이드_금융위원회_주식시세정보.docx"

if os.path.exists(doc_path):
    doc = docx.Document(doc_path)
    full_text = []
    for para in doc.paragraphs:
        if para.text.strip():
            full_text.append(para.text.strip())
            
    print(f"Total Paragraphs: {len(full_text)}")
    print("Sample lines:")
    for line in full_text[:30]:
        print(line)
        
    # Search for program or 차익
    print("\n--- Program trading references in docx ---")
    for line in full_text:
        if "프로그램" in line or "차익" in line or "http" in line or "Service" in line:
            print(line)
else:
    print("Docx file not found")
