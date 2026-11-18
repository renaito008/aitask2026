import {today,monthAt} from './domain.js';
const form=document.getElementById('create');form.elements.latestMeetingDate.value=today();form.elements.latestMeetingDate.max=today();form.elements.joinedMonth.max=monthAt(today());
form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;document.getElementById('error').textContent='';try{const response=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:Object.fromEntries(new FormData(form))}),referrerPolicy:'no-referrer'});const data=await response.json();if(!response.ok)throw Error(data.error);const url=t=>`${location.origin}/room#${t}`;document.getElementById('editLink').value=url(data.tokens.edit);document.getElementById('viewLink').value=url(data.tokens.view);document.getElementById('openRoom').href=url(data.tokens.edit);document.getElementById('created').hidden=false;form.hidden=true;document.getElementById('editLink').focus();}catch(err){document.getElementById('error').textContent=err.message;button.disabled=false;}};

// Copy only the selected room link; never send its contents to logs or other services.
for (const button of document.querySelectorAll('[data-copy-link]')) {
  button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.copyLink);
    const status = document.getElementById('copyStatus');
    if (!input.value) return;
    button.disabled = true;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(input.value);
        copied = true;
      }
    } catch { /* Try the selected-text fallback when clipboard permission is unavailable. */ }
    if (!copied) {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      try { copied = document.execCommand('copy'); } catch { copied = false; }
    }
    status.textContent = copied
      ? (button.dataset.copyLink === 'editLink' ? '編集リンクをコピーしました。' : '閲覧リンクをコピーしました。')
      : 'コピーできませんでした。URLを長押ししてコピーしてください。';
    button.disabled = false;
  });
}
