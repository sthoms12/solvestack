document.querySelectorAll(".js-email").forEach((el) => {
  const go = () => {
    const user = el.dataset.u;
    const domain = el.dataset.d;
    if (!user || !domain) return;
    window.location.href = `mailto:${user}@${domain}`;
  };
  el.addEventListener("click", go);
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      go();
    }
  });
});
