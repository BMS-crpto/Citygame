(function(){
  'use strict';
  if(window.CitygameHUD) return;
  function init(){
    var hud=document.getElementById('hud');
    if(!hud) return;
    var clock=document.getElementById('cg-clock');
    if(!clock){
      clock=document.createElement('div');clock.id='cg-clock';
      clock.innerHTML='<span aria-hidden="true">🕒</span><time id="cg-time" aria-label="Local time">--:--</time><span id="cg-date"></span>';
      document.body.appendChild(clock);
    }
    var time=clock.querySelector('#cg-time'),date=clock.querySelector('#cg-date');
    var formatter=new Intl.DateTimeFormat('en-NG',{hour:'2-digit',minute:'2-digit',hour12:true});
    var dateFormatter=new Intl.DateTimeFormat('en-NG',{weekday:'short',day:'numeric',month:'short'});
    function tick(){var now=new Date();time.textContent=formatter.format(now);date.textContent=dateFormatter.format(now);}
    tick();var timer=window.setInterval(tick,15000);
    var clean=document.getElementById('cg-clean-toggle');
    if(!clean){
      clean=document.createElement('button');clean.id='cg-clean-toggle';clean.type='button';
      clean.textContent='◉ Clean screen';clean.setAttribute('aria-pressed','false');
      document.body.appendChild(clean);
    }
    clean.addEventListener('click',function(){
      var active=document.body.classList.toggle('cg-clean');
      clean.setAttribute('aria-pressed',String(active));
      clean.textContent=active?'◎ Full HUD':'◉ Clean screen';
    });
    var phone=document.getElementById('phonebtn'),map=document.getElementById('mapbtn');
    if(phone) phone.setAttribute('aria-label','Open Citygame phone');
    if(map) map.setAttribute('aria-label','Open Lagos map');
    window.CitygameHUD={
      destroy:function(){window.clearInterval(timer);},
      clean:function(enabled){document.body.classList.toggle('cg-clean',!!enabled);clean.setAttribute('aria-pressed',String(!!enabled));}
    };
    document.documentElement.classList.add('citygame-hud-ready');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();