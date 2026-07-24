import zipfile
import re
import io

def run():
    with io.open('extract_out.txt', 'w', encoding='utf-8') as f_out:
        z = zipfile.ZipFile('테트리스U7_240808_decrypted.xlsm')
        wb = z.read('xl/workbook.xml').decode('utf-8')
        rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')

        rel_map = {}
        for rId, target in re.findall(r'<Relationship[^>]+Id=\"([^\"]+)\"[^>]+Target=\"([^\"]+)\"', rels):
            rel_map[rId] = target

        sheets = {}
        for match in re.finditer(r'<sheet name=\"([^\"]+)\"[^>]+r:id=\"([^\"]+)\"', wb):
            name = match.group(1)
            rId = match.group(2)
            if rId in rel_map:
                sheets[name] = rel_map[rId]
                
        f_out.write(f"Sheets: {sheets}\n")
        
        for name in ['DDM', '테트리스']:
            if name in sheets:
                target = 'xl/' + sheets[name]
                xml = z.read(target).decode('utf-8')
                f_out.write(f"\n--- {name} ({target}) formulas ---\n")
                
                for c_match in re.finditer(r'<c r=\"([A-Z0-9]+)\".*?>(.*?)</c>', xml):
                    ref = c_match.group(1)
                    inner = c_match.group(2)
                    
                    f_match = re.search(r'<f[^>]*>(.*?)</f>', inner)
                    v_match = re.search(r'<v[^>]*>(.*?)</v>', inner)
                    
                    f_val = f_match.group(1) if f_match else None
                    v_val = v_match.group(1) if v_match else None
                    
                    if f_val:
                        f_val = f_val.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
                        f_out.write(f"{ref} = {f_val}  (value: {v_val})\n")
                    elif v_val:
                        f_out.write(f"{ref} = (constant) {v_val}\n")

if __name__ == '__main__':
    run()
