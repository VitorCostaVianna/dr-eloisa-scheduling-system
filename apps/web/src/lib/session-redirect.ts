// Isolado para os testes poderem trocar a navegação (jsdom não implementa location.assign).
// Navegação "dura" (não router.push): descarta o estado do cliente e passa pelo proxy/layout
// do zero, sem deixar a tela com dados de uma sessão morta.
export function redirectToLogin(): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- navegação dura proposital (ver acima)
  window.location.assign('/login');
}
