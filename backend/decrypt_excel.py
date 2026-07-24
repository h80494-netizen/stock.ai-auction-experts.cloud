import msoffcrypto
import io

file_path = '테트리스U7_240808.xlsm'
decrypted_path = '테트리스U7_240808_decrypted.xlsm'

try:
    with open(file_path, "rb") as f:
        file = msoffcrypto.OfficeFile(f)
        file.load_key(password="spring11")  # User provided password
        with open(decrypted_path, "wb") as f_dec:
            file.decrypt(f_dec)
    print("Decryption successful. Saved as", decrypted_path)
except Exception as e:
    print("Decryption failed:", e)
    
