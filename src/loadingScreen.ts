export function createLoadingScreen(): HTMLDivElement {
    const style = document.createElement('style');
    style.innerHTML = `
  #loadingScreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #1a1a1a;
    color: #FFFFFF;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    font-family: "Press Start 2P", monospace;
    opacity: 1;
    transition: opacity 0.3s ease-out;
    image-rendering: pixelated;
  }
  .loading-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: #2d2d2d;
    padding: 20px;
    border: 3px solid #000000;
    box-shadow: 
      inset 2px 2px 0 #1a1a1a,
      inset -2px -2px 0 #404040,
      5px 5px 0 #000000;
  }
  .loader {
    width: 200px;
    height: 20px;
    background-color: #1a1a1a;
    border: 2px solid #000000;
    margin-bottom: 20px;
    position: relative;
    overflow: hidden;
  }
  .loader::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 0%;
    background-color: #00ff00;
    box-shadow: inset 1px 1px 0 #88ff88;
    animation: loadingProgress 2.5s linear infinite;
  }
  .loading-container p {
    font-size: 16px;
    margin: 0;
    color: #FFFFFF;
    text-shadow: 2px 2px 0 #000000;
  }
  @keyframes loadingProgress {
    0% { width: 0%; }
    25% { width: 50%; }
    50% { width: 75%; }
    75% { width: 90%; }
    100% { width: 100%; }
  }
    `;
    document.head.appendChild(style);
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.innerHTML = `
    <div class="loading-container">
      <div class="loader"></div>
      <p>LOADING...</p>
    </div>
    `;
    document.body.appendChild(loadingScreen);
    return loadingScreen;
  }

  export function removeLoadingScreen(): void {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.style.opacity = "0";
      setTimeout(() => {
        if (loadingScreen.parentNode) {
          loadingScreen.parentNode.removeChild(loadingScreen);
        }
      }, 300);
    }
  }