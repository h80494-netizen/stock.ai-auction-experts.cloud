import openpyxl

file_path = '테트리스U7_240808.xlsm'
try:
    wb = openpyxl.load_workbook(file_path, data_only=False)
    print("Sheet names:", wb.sheetnames)
except Exception as e:
    print("Error:", e)
