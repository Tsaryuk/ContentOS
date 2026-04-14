/* Личная Стратегия — shared article interactions */

// Subscribe form (shared with landing)
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('subscribeForm');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var btn = form.querySelector('button');
      var inp = document.getElementById('emailInput');
      btn.disabled = true;
      btn.textContent = '...';
      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inp.value })
      })
        .then(function(r) { return r.json() })
        .then(function(d) {
          if (d.error) { btn.textContent = 'Ошибка'; btn.disabled = false; }
          else btn.textContent = 'Готово!';
        })
        .catch(function() { btn.textContent = 'Ошибка'; btn.disabled = false; });
    });
  }

  // Copy link button
  var copyBtn = document.getElementById('copyLinkBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', function(e) {
      e.preventDefault();
      navigator.clipboard.writeText(window.location.href);
      var orig = copyBtn.innerHTML;
      copyBtn.innerHTML = 'Скопировано!';
      setTimeout(function() { copyBtn.innerHTML = orig; }, 2000);
    });
  }

  // Telegram share — build URL dynamically
  var tgBtn = document.getElementById('shareTelegramBtn');
  if (tgBtn) {
    var title = document.querySelector('meta[property="og:title"]');
    tgBtn.href = 'https://t.me/share/url?url=' + encodeURIComponent(window.location.href)
      + '&text=' + encodeURIComponent(title ? title.getAttribute('content') : document.title);
  }
});

// Yandex Metrika
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108538087', 'ym');
if (typeof ym === 'function') {
  ym(108538087, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
}
