// Catch dependency failures too, which a static import in game.js cannot do.
const root = document.querySelector('#balance-game');
function showFailure() {
  root.dataset.state = 'error';
  const message = root.querySelector('#boat-load-message');
  message.hidden = false;
  message.textContent = 'The 3D scene could not start. Use a browser with WebGL 2 enabled, then reload this page. If you are offline, reconnect once to load the game files.';
  root.querySelector('#boat-challenge').textContent = 'Your boat is waiting.';
  root.querySelector('#boat-announcement').textContent = message.textContent;
}
const gameModule = root.dataset.game === 'moving' ? './moving-game.js' : './game.js';
import(gameModule).then(module => module.startGame(root, showFailure)).catch(error => {
  console.error('Balance the Boat could not start:', error);
  showFailure();
});
