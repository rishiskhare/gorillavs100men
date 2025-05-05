export function createLoadingScreen(): HTMLDivElement {
    const style = document.createElement('style');
    style.innerHTML = `
  #loadingScreen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: #000;
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    font-family: 'Inter', sans-serif;
    opacity: 1;
    transition: opacity 0.3s ease-out;
  }
  .loading-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1.5s linear infinite;
    margin-bottom: 16px;
  }
  .loading-container p {
    font-size: 20px;
    margin: 0;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
    `;
    document.head.appendChild(style);
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.innerHTML = `
    <div class="loading-container">
      <div class="loader"></div>
      <p>Loading...</p>
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