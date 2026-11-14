// Pictures are shrunk in the browser before upload, so a phone photo of several megabytes
// becomes a couple of hundred kilobytes and sends quickly.
const MAX_SIDE = 1600;
const MAX_BYTES = 1_400_000;

const toBlob = (canvas, quality) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));

async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't a picture this browser can open"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** @returns a Blob ready to upload. Throws an Error with a message for the user if the file can't be used. */
export async function prepareImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose a picture (JPEG, PNG, GIF or WebP)');
  // A small animated GIF is sent untouched so it keeps moving.
  if (file.type === 'image/gif' && file.size <= MAX_BYTES) return file;
  const source = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent areas would otherwise turn black in a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.84, 0.7, 0.55]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('That picture is too large to send');
}
