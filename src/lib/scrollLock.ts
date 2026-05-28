/** Clears Radix / third-party scroll locks left on body after overlays close. */
export function releaseDocumentScrollLock() {
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  document.body.style.removeProperty('pointer-events');
  document.body.removeAttribute('data-scroll-locked');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.removeAttribute('data-scroll-locked');
}
