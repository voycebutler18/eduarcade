import io, os, tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image
import fitz
from paddleocr import PaddleOCR

app=FastAPI(title='RentPilot Open Document Vision')
ocr=PaddleOCR(use_doc_orientation_classify=True,use_doc_unwarping=True,use_textline_orientation=True)

def image_text(img: Image.Image):
    with tempfile.NamedTemporaryFile(suffix='.png',delete=False) as f:
        img.convert('RGB').save(f.name)
        path=f.name
    try:
        result=ocr.predict(path)
        parts=[]
        for page in result:
            data=getattr(page,'json',None)
            if callable(data): data=data()
            if isinstance(data,dict):
                r=data.get('res',data)
                texts=r.get('rec_texts',[]) if isinstance(r,dict) else []
                parts.extend([str(x) for x in texts if str(x).strip()])
            else:
                parts.append(str(page))
        return '\n'.join(parts)
    finally:
        try: os.unlink(path)
        except: pass

def pdf_text(raw: bytes):
    doc=fitz.open(stream=raw,filetype='pdf'); pages=[]
    for p in doc:
        direct=p.get_text('text').strip()
        if len(direct)>80: pages.append(direct); continue
        pix=p.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
        pages.append(image_text(Image.open(io.BytesIO(pix.tobytes('png')))))
    return '\n\n'.join(pages)

@app.get('/health')
def health(): return {'ok':True,'engine':'PaddleOCR','open_source':True}

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
