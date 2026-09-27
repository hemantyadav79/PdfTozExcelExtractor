import json

# Output layout JSON structure we expect
JSON_STRUCTURE = {
  "bank_name": "Name of the Bank",
  "account_number": "Account Number or Identifier",
  "account_holder": "Full name of the account owner",
  "statement_period": "Start date to End date of statement",
  "transactions": [
    {
      "date": "YYYY-MM-DD or raw date string from statement",
      "description": "Transaction details, payee, description, or memo",
      "reference": "Reference number, cheque number, or ID",
      "debit": "Amount spent/debited, or empty string",
      "credit": "Amount received/credited, or empty string",
      "balance": "Running balance, or empty string"
    }
  ]
}

SYSTEM_PROMPT = """You are a highly advanced Financial Document AI Parser. 
Your task is to analyze the provided OCR raw text, tables, or document content of a bank statement and extract structured data matching the schema perfectly.

Rules:
1. Extract the Bank Name, Account Number, Account Holder, and Statement Period.
2. For each transaction row, extract:
   - Date: Keep original date format or normalize to YYYY-MM-DD if clear.
   - Description: The full description or transaction text.
   - Reference: Reference number, check number, transaction ID, or similar (use empty string if none).
   - Debit: Numeric value of withdrawals/debits (must be empty string if not a debit). Do not include currency symbols or commas.
   - Credit: Numeric value of deposits/credits (must be empty string if not a credit). Do not include currency symbols or commas.
   - Balance: Running balance value. Must be empty string if not present.
3. Keep transactions chronologically ordered exactly as they appear in the input document.
4. If a transaction spans multiple lines, merge the description text into a single description field.
5. If the document has no transactions, return an empty array for "transactions".
6. Return ONLY valid JSON. Do not write explanations. Do not include markdown code block formatting (e.g. do NOT wrap with ```json). Start directly with the opening curly brace { and end with }."""

USER_PROMPT_TEMPLATE = """
Here is the text extracted from the bank statement:

========================================
{document_content}
========================================

Please parse this text and output the JSON data according to the exact structure:
{json_structure}
"""

def build_user_prompt(document_text: str) -> str:
    return USER_PROMPT_TEMPLATE.format(
        document_content=document_text,
        json_structure=json.dumps(JSON_STRUCTURE, indent=2)
    )
