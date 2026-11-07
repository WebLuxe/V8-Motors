import{i as S,s as l,$ as b,r as A,C as h,d as L,a as g}from"./layout-BC__UEg2.js";import{g as M}from"./motion-C4qfQhce.js";import{w as x}from"./card-BPSA49O3.js";import{b as $,C as u,c as f,r as d,t as j,m as E,k as P}from"./data-D7J9h-jt.js";S();x();const y=(new URLSearchParams(location.search).get("ids")||"").split(",").filter(e=>$(e));y.length&&l.setCompare(y);const R=[{k:"Price",v:e=>d(e.price),n:e=>e.price,best:"min",bar:!0},{k:"Monthly, 20% down over 5 years",v:e=>d(E(e.price)),n:e=>e.price,best:"min"},{k:"Year",v:e=>e.year,n:e=>e.year,best:"max"},{k:"Mileage",v:e=>P(e.km),n:e=>e.km??void 0,best:"min"},{k:"Engine",v:e=>e.engineCc?`${e.engine} (${e.engineCc.toLocaleString("en-US")} cc)`:"Ask us"},{k:"Fuel",v:e=>e.fuel},{k:"Gearbox",v:e=>e.gearbox},{k:"Body",v:e=>e.body},{k:"Colour",v:e=>e.colour||"Ask us"},{k:"Seats",v:e=>e.seats||"Ask us",n:e=>e.seats??void 0,best:"max"},{k:"Doors",v:e=>e.doors||"Ask us"},{k:"Photos",v:e=>`${e.images.length}`}],r=b("[data-compare-root]"),m=b("[data-diff]");function p(e){const o=l.compare(),t=o.map($).filter(Boolean);if(t.length<o.length&&l.setCompare(t.map(a=>a.id)),history.replaceState(null,"",t.length?`?ids=${t.map(a=>a.id).join(",")}`:location.pathname),!t.length){r.innerHTML=`<div class="empty"><p class="empty-title">Nothing to compare yet.</p>
      <p>Tap Compare on any car in the catalogue to add it here. You can compare up to three.</p>
      <a href="inventory.html" class="btn btn-primary">Open the catalogue</a></div>`;return}const i=[...t,...Array(h-t.length).fill(null)],k=u.filter(a=>!t.includes(a)).map(a=>`<option value="${a.id}">${f(a)}, ${d(a.price)}</option>`).join(""),w=Math.max(...t.map(a=>a.price));r.style.setProperty("--cols",h),r.innerHTML=`
    <div class="cmp-scroll"><div class="cmp" role="table" aria-label="Car comparison">
      <div class="cmp-row cmp-row--head" role="row">
        <div class="cmp-key" role="rowheader"></div>
        ${i.map(a=>a?`
          <div class="cmp-car" role="columnheader">
            <a href="cars/${a.id}.html" class="cmp-img" tabindex="-1" aria-hidden="true"><img src="${j(a,0,960)}" width="700" height="460" alt="" loading="lazy" decoding="async" /></a>
            <a href="cars/${a.id}.html" class="cmp-name">${f(a)}</a>
            <p class="cmp-trim">${a.trim}</p>
            <button type="button" class="link cmp-remove" data-remove="${a.id}">Remove</button>
          </div>`:`
          <div class="cmp-car cmp-car--empty" role="columnheader">
            <label class="cmp-add"><span>Add a car</span>
              <select data-add><option value="">Choose from ${u.length-t.length} cars</option>${k}</select></label>
          </div>`).join("")}
      </div>
      ${R.map(a=>{const v=t.map(s=>a.v(s)),C=v.every(s=>String(s)===String(v[0]));let n=null;if(a.best&&t.filter(s=>a.n(s)!=null).length>1){const s=t.map(a.n).filter(c=>c!=null);n=a.best==="min"?Math.min(...s):Math.max(...s),s.every(c=>c===n)&&(n=null)}return`<div class="cmp-row ${C&&t.length>1?"is-same":""}" role="row">
          <div class="cmp-key" role="rowheader">${a.k}</div>
          ${i.map(s=>s?`<div class="cmp-val tabular-nums ${n!==null&&a.n(s)===n?"is-best":""}" role="cell">
            ${a.v(s)}${a.bar?`<span class="cmp-bar"><span style="--v:${s.price/w}"></span></span>`:""}</div>`:'<div class="cmp-val" role="cell"></div>').join("")}
        </div>`}).join("")}
      <div class="cmp-row cmp-row--cta" role="row">
        <div class="cmp-key" role="rowheader"></div>
        ${i.map(a=>a?`<div role="cell"><a href="cars/${a.id}.html" class="btn btn-primary btn-wide">See this car</a></div>`:'<div role="cell"></div>').join("")}
      </div>
    </div></div>`,r.classList.toggle("only-diff",m.checked),e&&L(g(".cmp-car")),requestAnimationFrame(()=>g(".cmp-bar > span").forEach(a=>a.classList.add("is-in")))}r.addEventListener("click",e=>{const o=e.target.closest("[data-remove]");if(!o||o.dataset.going)return;o.dataset.going="1";const t=o.closest(".cmp-car"),i=()=>{l.toggleCompare(o.dataset.remove),p(!1)};if(A)return i();M.to(t,{opacity:0,y:-20,duration:.3,onComplete:i})});r.addEventListener("change",e=>{const o=e.target.closest("[data-add]");o?.value&&(l.toggleCompare(o.value),p(!0))});m.addEventListener("change",()=>r.classList.toggle("only-diff",m.checked));p(!1);
