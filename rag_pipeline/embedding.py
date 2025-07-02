import pandas as pd
from langchain_core.documents import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
import requests
import json

# Vector embedding and vector store using Hugging Face + FAISS
from langchain.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

# Fetch the data
url = "https://desire4travels-1.onrender.com/services"
response = requests.get(url)

# Parse the JSON string (strip <pre> tags first)
json_data = json.loads(response.text)

# Convert to LangChain Document objects keyword arguments
doc = []
for item in json_data:
    city = item.get("city", "")
    provider = item.get("providerName", "")
    service = item.get("serviceType", "")
    website = item.get("contactInfo", "")
    
    text = f"{provider} offers {service} services in {city}. Visit: {website}"
    doc.append(Document(page_content=text))


# Split into chunks
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)

docs = text_splitter.split_documents(doc)

# Preview 
for d in docs[:2]:
    print(d.page_content)

# embedding
# 1. Setup Hugging Face embedding model
embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"}  # Use 'cuda' if you have a GPU
)

# 2. Create FAISS vector store
print(f"\nCreating FAISS vector store with {len(docs)} documents...")
db = FAISS.from_documents(docs, embedding)

# 3. Persist FAISS index locally
db.save_local("faiss_index")
print(" Vector database saved to 'faiss_index'")

# 4. Test similarity search
print("\nTesting similarity search...")
results = db.similarity_search("Where is kochi Advanture co.?", k=2)
for i, doc in enumerate(results, 1):
    print(f"\nResult {i}:\n{doc.page_content}")