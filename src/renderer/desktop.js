const reference = document.getElementById('reference');
const textContent = document.getElementById('textContent');
const imageContent = document.getElementById('imageContent');
const emptyState = document.getElementById('emptyState');

async function loadContent() {
  const token = new URLSearchParams(window.location.search).get('token');
  const content = await window.goodcopyDesktop.getContent(token);
  if (!content) return;

  document.title = content.title;
  document.documentElement.classList.toggle('dark-mode', content.darkMode);
  if (content.contentType === 'Image' && content.imageUrl) {
    textContent.hidden = true;
    imageContent.hidden = false;
    imageContent.src = content.imageUrl;
  } else {
    textContent.textContent = content.text || '';
  }
  emptyState.hidden = true;
  reference.hidden = false;
}

loadContent();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

reference.addEventListener('dblclick', () => {
  window.close();
});

let dragState = null;

reference.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0) return;
  const pointerId = event.pointerId;
  reference.setPointerCapture(pointerId);
  dragState = {
    pointerId,
    pointerX: event.screenX,
    pointerY: event.screenY,
    windowX: null,
    windowY: null
  };

  const origin = await window.goodcopyDesktop.startDrag();
  if (!origin || dragState?.pointerId !== pointerId) return;
  dragState.windowX = origin.x;
  dragState.windowY = origin.y;
});

reference.addEventListener('pointermove', (event) => {
  if (
    !dragState ||
    dragState.pointerId !== event.pointerId ||
    dragState.windowX === null ||
    (event.buttons & 1) === 0
  ) {
    return;
  }
  window.goodcopyDesktop.moveTo(
    dragState.windowX + event.screenX - dragState.pointerX,
    dragState.windowY + event.screenY - dragState.pointerY
  );
});

function stopDragging(event) {
  if (event?.pointerId !== undefined && dragState?.pointerId !== event.pointerId) return;
  if (event?.pointerId !== undefined && reference.hasPointerCapture(event.pointerId)) {
    reference.releasePointerCapture(event.pointerId);
  }
  dragState = null;
}

reference.addEventListener('pointerup', stopDragging);
reference.addEventListener('pointercancel', stopDragging);
window.addEventListener('blur', stopDragging);
