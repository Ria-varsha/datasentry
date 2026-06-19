import os
import random
from datetime import datetime, timedelta

os.makedirs("test_files", exist_ok=True)

# 1. Perfect Data (50 rows)
def generate_perfect():
    with open("test_files/1_perfect_data.csv", "w", encoding="utf-8") as f:
        f.write("order_id,product_id,payment_mode,phone,country_code,transaction_date,customer_name\n")
        for i in range(1, 51):
            order = f"ORD-{1000+i}"
            prod = f"PROD-{random.randint(10,99)}"
            pay = random.choice(["CREDIT", "DEBIT", "PAYPAL", "STRIPE"])
            if random.choice([True, False]):
                cc = "SG"
                phone = f"{random.choice([8,9])}{random.randint(1000000, 9999999)}"
            else:
                cc = "IN"
                phone = f"{random.randint(6,9)}{random.randint(100000000, 999999999)}"
            date = (datetime(2023, 1, 1) + timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
            f.write(f"{order},{prod},{pay},{phone},{cc},{date},Customer {i}\n")

# 2. All Errors (15 rows)
def generate_errors():
    with open("test_files/2_heavy_errors.csv", "w", encoding="utf-8") as f:
        f.write("order_id,product_id,payment_mode,phone,country_code,transaction_date\n")
        bad_data = [
            # Missing order_id
            ",PROD-1,CASH,81234567,SG,2023-10-10",
            # Missing product_id
            "ORD-2,,CASH,81234567,SG,2023-10-10",
            # Missing payment
            "ORD-3,PROD-1,,81234567,SG,2023-10-10",
            # Bad SG Phone (7 digits)
            "ORD-4,PROD-1,CASH,8123456,SG,2023-10-10",
            # Bad SG Phone (starts with 7)
            "ORD-5,PROD-1,CASH,71234567,SG,2023-10-10",
            # Bad IN Phone (9 digits)
            "ORD-6,PROD-1,CASH,987654321,IN,2023-10-10",
            # Missing Country Code
            "ORD-7,PROD-1,CASH,81234567,,2023-10-10",
            # Unsupported Country Code
            "ORD-8,PROD-1,CASH,1234567890,US,2023-10-10",
            # Bad Date Format (DD/MM/YYYY)
            "ORD-9,PROD-1,CASH,81234567,SG,10/10/2023",
            # Bad Date Format (Text)
            "ORD-10,PROD-1,CASH,81234567,SG,Yesterday",
            # Multi-error (Missing Product, Bad Phone, Bad Date)
            "ORD-11,,CASH,123,SG,10-10-2023",
            # Multi-error (Everything missing)
            ",,,,,",
        ]
        f.write("\n".join(bad_data))

# 3. Large Dataset for Chunking Testing (2500 rows - ~80% clean, 20% errors)
def generate_large():
    with open("test_files/3_large_chunk_test.csv", "w", encoding="utf-8") as f:
        f.write("order_id,product_id,payment_mode,phone,country_code,transaction_date,notes\n")
        for i in range(1, 2501):
            order = f"BIG-{5000+i}"
            prod = f"PROD-X{random.randint(1,5)}"
            pay = random.choice(["CREDIT", "STRIPE"])
            
            # 20% chance to corrupt data
            if random.random() < 0.2:
                # Corrupt one element
                err_type = random.randint(1,3)
                if err_type == 1:
                    pay = "" # Missing required
                    cc, phone = "SG", "81234567"
                    date = "2023-05-05"
                elif err_type == 2:
                    cc, phone = "SG", "123" # Bad phone
                    date = "2023-05-05"
                else:
                    cc, phone = "IN", "9999999999"
                    date = "05/05/2023" # Bad date
            else:
                cc = "IN"
                phone = f"{random.randint(6,9)}{random.randint(100000000, 999999999)}"
                date = (datetime(2023, 1, 1) + timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
                
            f.write(f"{order},{prod},{pay},{phone},{cc},{date},Bulk order processing\n")

print("Generating files...")
generate_perfect()
generate_errors()
generate_large()
print("Done! Files saved in test_files/")
