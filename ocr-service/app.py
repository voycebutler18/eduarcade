import io, os, tempfile, base64
from functools import lru_cache
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import fitz

app=FastAPI(title='RentPilot Open Document Vision')
app.add_middleware(CORSMiddleware,allow_origins=['https://rentpilot-ai.onrender.com'],allow_credentials=False,allow_methods=['POST','GET'],allow_headers=['*'])

@lru_cache(maxsize=1)
def get_ocr():
    from paddleocr import PaddleOCR
    return PaddleOCR(use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False,text_detection_model_name='PP-OCRv5_mobile_det',text_recognition_model_name='PP-OCRv5_mobile_rec')

def image_text(img: Image.Image):
    img=img.convert('RGB'); img.thumbnail((2400,2400),Image.Resampling.LANCZOS)
    with tempfile.NamedTemporaryFile(suffix='.jpg',delete=False) as f:
        img.save(f.name,format='JPEG',quality=92,optimize=True); path=f.name
    try:
        result=get_ocr().predict(path); parts=[]
        for page in result:
            data=getattr(page,'json',None)
            if callable(data): data=data()
            if isinstance(data,dict):
                r=data.get('res',data); texts=r.get('rec_texts',[]) if isinstance(r,dict) else []
                parts.extend([str(x) for x in texts if str(x).strip()])
            else: parts.append(str(page))
        return '\n'.join(parts)
    finally:
        try: os.unlink(path)
        except: pass

def pdf_text(raw: bytes):
    doc=fitz.open(stream=raw,filetype='pdf'); pages=[]
    try:
        for p in doc:
            direct=p.get_text('text').strip()
            if len(direct)>80: pages.append(direct); continue
            pix=p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
            pages.append(image_text(Image.open(io.BytesIO(pix.tobytes('jpeg')))))
    finally: doc.close()
    return '\n\n'.join(pages)

def data_url(img):
    img=img.convert('RGB'); img.thumbnail((1800,2400),Image.Resampling.LANCZOS)
    b=io.BytesIO(); img.save(b,format='JPEG',quality=82,optimize=True)
    return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode('ascii')

def render_pages(raw,c,name):
    if c=='application/pdf' or name.endswith('.pdf'):
        doc=fitz.open(stream=raw,filetype='pdf'); out=[]
        try:
            for i in range(min(3,len(doc))):
                pix=doc[i].get_pixmap(matrix=fitz.Matrix(1.45,1.45),alpha=False)
                out.append(data_url(Image.open(io.BytesIO(pix.tobytes('jpeg')))))
        finally: doc.close()
        return out
    return [data_url(Image.open(io.BytesIO(raw)))]

@app.get('/health')
def health(): return {'ok':True,'engine':'PaddleOCR','open_source':True,'model_loading':'lazy','page_rendering':True}

@app.post('/lease-pages')
async def lease_pages(file: UploadFile=File(...)):
    raw=await file.read()
    if not raw or len(raw)>30*1024*1024: raise HTTPException(400,'File must be between 1 byte and 30 MB')
    c=(file.content_type or '').lower(); name=(file.filename or '').lower()
    try: pages=render_pages(raw,c,name)
    except Exception as e: raise HTTPException(422,f'Unable to render document: {type(e).__name__}')
    return {'pages':pages,'filename':file.filename}

@app.post('/ocr')
async def read_document(file: UploadFile=File(...)):
    raw=await file.read()
    if not raw or len(raw)>30*1024*1024: raise HTTPException(400,'File must be between 1 byte and 30 MB')
    c=(file.content_type or '').lower(); name=(file.filename or '').lower()
    try:
        if c=='application/pdf' or name.endswith('.pdf'): text=pdf_text(raw)
        elif c.startswith('image/') or name.endswith(('.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff')): text=image_text(Image.open(io.BytesIO(raw)))
        else: raise HTTPException(415,'Supported visual documents: PDF, PNG, JPG, JPEG, WEBP, BMP and TIFF')
    except HTTPException: raise
    except Exception as e: raise HTTPException(422,f'Unable to read document: {type(e).__name__}')
    if not text.strip(): raise HTTPException(422,'No readable text detected')
    return {'text':text[:120000],'engine':'PaddleOCR','filename':file.filename}
