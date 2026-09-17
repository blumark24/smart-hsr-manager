(() => {
  'use strict';

  const STYLE_ID = 'uc-phase11e-interactions';
  const ROOT_SELECTOR = '[data-uc-v2="true"]';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root{
        --uc-ease:cubic-bezier(.22,1,.36,1);
        --uc-fast:150ms;
        --uc-med:260ms;
        --uc-slow:420ms;
      }

      ${ROOT_SELECTOR} .uc2-primary,
      ${ROOT_SELECTOR} .uc2-secondary,
      ${ROOT_SELECTOR} .uc2-kpi,
      ${ROOT_SELECTOR} .uc2-row,
      ${ROOT_SELECTOR} button,
      .iuc .btn,
      .iuc .tab,
      .iuc .pc,
      .iuc input,
      .iuc select,
      .iuc textarea{
        transition:
          transform var(--uc-fast) var(--uc-ease),
          box-shadow var(--uc-med) var(--uc-ease),
          border-color var(--uc-fast) ease,
          background-color var(--uc-fast) ease,
          opacity var(--uc-fast) ease,
          filter var(--uc-fast) ease!important;
      }

      ${ROOT_SELECTOR} .uc2-primary:hover,
      ${ROOT_SELECTOR} .uc2-secondary:hover,
      .iuc .btn:hover:not(:disabled){transform:translateY(-1px)}

      ${ROOT_SELECTOR} .uc2-primary:active,
      ${ROOT_SELECTOR} .uc2-secondary:active,
      .iuc .btn:active:not(:disabled){transform:translateY(0) scale(.985)}

      ${ROOT_SELECTOR} .uc2-kpi{will-change:transform}
      ${ROOT_SELECTOR} .uc2-kpi:hover{
        transform:translateY(-3px);
        box-shadow:0 24px 52px -36px rgba(0,0,0,.9),inset 0 1px rgba(255,255,255,.05)!important;
      }

      ${ROOT_SELECTOR} .uc2-row{isolation:isolate}
      ${ROOT_SELECTOR} .uc2-row:hover{transform:translateX(-2px)}
      ${ROOT_SELECTOR} .uc2-row:focus-within{
        outline:2px solid color-mix(in srgb,var(--u-teal,#4fd1c5) 52%,transparent);
        outline-offset:-2px;
      }

      .iuc{
        animation:ucBackdropIn var(--uc-med) var(--uc-ease) both;
      }
      .iuc>div{
        transform-origin:50% 48%;
        animation:ucDialogIn var(--uc-slow) var(--uc-ease) both;
      }
      .iuc.uc-leaving{animation:ucBackdropOut var(--uc-fast) ease both}
      .iuc.uc-leaving>div{animation:ucDialogOut var(--uc-fast) ease both}

      .iuc .tabs{
        position:sticky;
        top:73px;
        z-index:3;
        backdrop-filter:blur(14px);
      }
      .iuc .tab{position:relative;overflow:hidden}
      .iuc .tab::after{
        content:'';
        position:absolute;
        inset-inline:18%;
        bottom:0;
        height:2px;
        border-radius:999px;
        background:var(--uc-accent,#20c9b0);
        transform:scaleX(0);
        transform-origin:center;
        transition:transform var(--uc-med) var(--uc-ease);
      }
      .iuc .tab.on::after{transform:scaleX(1)}

      .iuc .pane:not([hidden]){
        animation:ucPaneIn var(--uc-med) var(--uc-ease) both;
      }

      .iuc input:focus,
      .iuc select:focus,
      .iuc textarea:focus{
        transform:translateY(-1px);
      }

      .iuc .pc:hover{
        transform:translateY(-2px);
        box-shadow:0 16px 34px -28px rgba(0,0,0,.55);
      }
      .iuc .pc.on{
        box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--uc-accent,#20c9b0) 34%,transparent);
      }

      .iuc .msg.ok,
      .iuc .msg.wa,
      .iuc .msg.er{
        animation:ucMessageIn var(--uc-med) var(--uc-ease) both;
      }

      .iuc button:disabled,
      ${ROOT_SELECTOR} button:disabled{
        cursor:not-allowed!important;
        filter:saturate(.55)!important;
        transform:none!important;
      }

      .uc-busy::after{
        content:'';
        width:13px;height:13px;
        border:2px solid currentColor;
        border-inline-start-color:transparent;
        border-radius:50%;
        display:inline-block;
        margin-inline-start:8px;
        vertical-align:-2px;
        animation:ucSpin .72s linear infinite;
      }

      .uc-toast-stack{
        position:fixed;
        inset-inline-start:22px;
        bottom:22px;
        z-index:2147483646;
        display:grid;
        gap:10px;
        width:min(360px,calc(100vw - 32px));
        pointer-events:none;
      }
      .uc-toast{
        pointer-events:auto;
        border:1px solid rgba(91,154,194,.24);
        background:rgba(8,18,31,.94);
        color:#edf7ff;
        border-radius:14px;
        padding:12px 14px;
        box-shadow:0 24px 70px -34px rgba(0,0,0,.9);
        backdrop-filter:blur(16px);
        animation:ucToastIn var(--uc-slow) var(--uc-ease) both;
        font-size:12px;
        line-height:1.65;
      }
      .uc-toast.ok{border-color:rgba(32,185,129,.34)}
      .uc-toast.er{border-color:rgba(255,113,128,.36)}

      @keyframes ucBackdropIn{from{opacity:0}to{opacity:1}}
      @keyframes ucBackdropOut{from{opacity:1}to{opacity:0}}
      @keyframes ucDialogIn{from{opacity:0;transform:translateY(18px) scale(.975)}to{opacity:1;transform:none}}
      @keyframes ucDialogOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.985)}}
      @keyframes ucPaneIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      @keyframes ucMessageIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
      @keyframes ucToastIn{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
      @keyframes ucSpin{to{transform:rotate(360deg)}}

      @media (max-width:780px){
        .uc-toast-stack{inset-inline:16px;bottom:16px;width:auto}
        .iuc .tabs{top:68px;overflow-x:auto;scrollbar-width:none}
        .iuc .tabs::-webkit-scrollbar{display:none}
      }

      @media (prefers-reduced-motion:reduce){
        *,*::before,*::after{
          animation-duration:.001ms!important;
          animation-iteration-count:1!important;
          transition-duration:.001ms!important;
          scroll-behavior:auto!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message, type = 'ok') {
    if (!message) return;
    let stack = document.querySelector('.uc-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'uc-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const node = document.createElement('div');
    node.className = `uc-toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => node.remove(), 180);
    }, 3200);
  }

  function enhanceButtons(root = document) {
    root.querySelectorAll('.iuc .btn, [data-uc-v2="true"] button').forEach(button => {
      if (button.dataset.ucMotionBound === '1') return;
      button.dataset.ucMotionBound = '1';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        button.animate?.([
          { transform:'scale(1)' },
          { transform:'scale(.985)', offset:.45 },
          { transform:'scale(1)' }
        ], { duration:180, easing:'cubic-bezier(.22,1,.36,1)' });
      });
    });
  }

  function enhanceMessages(root = document) {
    root.querySelectorAll('.iuc .msg').forEach(msg => {
      if (msg.dataset.ucObserved === '1') return;
      msg.dataset.ucObserved = '1';
      let previous = msg.textContent.trim();
      const observer = new MutationObserver(() => {
        const current = msg.textContent.trim();
        if (!current || current === previous) return;
        previous = current;
        if (msg.classList.contains('ok')) toast(current, 'ok');
        else if (msg.classList.contains('er')) toast(current, 'er');
      });
      observer.observe(msg, { childList:true, characterData:true, subtree:true, attributes:true, attributeFilter:['class'] });
    });
  }

  function enhanceDialogs(root = document) {
    root.querySelectorAll('.iuc').forEach(modal => {
      if (modal.dataset.ucEscapeBound === '1') return;
      modal.dataset.ucEscapeBound = '1';
      const closeButton = modal.querySelector('.ix');
      const close = () => {
        if (!modal.isConnected || modal.classList.contains('uc-leaving')) return;
        modal.classList.add('uc-leaving');
        setTimeout(() => {
          if (modal.isConnected) (closeButton?.onclick ? closeButton.click() : modal.remove());
        }, 145);
      };
      const handler = event => {
        if (event.key === 'Escape' && modal.isConnected) close();
      };
      document.addEventListener('keydown', handler);
      const cleanup = new MutationObserver(() => {
        if (!modal.isConnected) {
          document.removeEventListener('keydown', handler);
          cleanup.disconnect();
        }
      });
      cleanup.observe(document.body, { childList:true, subtree:true });
    });
  }

  function apply() {
    injectStyles();
    enhanceButtons();
    enhanceMessages();
    enhanceDialogs();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };

  function start() {
    apply();
    new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();