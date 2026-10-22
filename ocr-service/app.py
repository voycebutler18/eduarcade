import io, os, tempfile
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
    # Keep the 512 MB Render service alive: disable document-orientation,
    # unwarping and text-line orientation auxiliary models. OCR still reads
    # photos/scans, while PDFs with embedded text bypass OCR entirely.
    return PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_detection_model_name='PP-OCRv5_mobile_det',
        text_recognition_model_name='PP-OCRv5_mobile_rec',
    )

def image_text(img: Image.Image):
    # Bound giant phone photos before inference to reduce peak RAM.
    img=img.convert('RGB')
    img.thumbnail((2400,2400),Image.Resampling.LANCZOS)
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
            # 1.5x is enough for OCR and materially lowers memory versus 2x.
            pix=p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False)
            pages.append(image_text(Image.open(io.BytesIO(pix.tobytes('jpeg')))))
    finally: doc.close()
    return '\n\n'.join(pages)

@app.get('/health')
def health(): return {'ok':True,'engine':'PaddleOCR','open_source':True,'model_loading':'lazy'}

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
