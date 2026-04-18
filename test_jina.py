import os
from openai import OpenAI
client = OpenAI(base_url='https://api.jina.ai/v1', api_key='jina_a27c34b24bfd4d78a195a1359292fa1cNuG59YZ_d-IbLxsNgnE3Ngpko853')
res = client.embeddings.create(model='jina-embeddings-v5-text-small', input=['hello'])
print(res)
