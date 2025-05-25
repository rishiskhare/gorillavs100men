export function createLoadingScreen(): HTMLDivElement {
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'loadingScreen';
    loadingScreen.innerHTML = `
    <div class="loading-container">
      <div class="loader">
        <div class="loader-fill"></div>
      </div>
      <p>LOADING...</p>
    </div>
    `;
    document.body.appendChild(loadingScreen);
    return loadingScreen;
  }

  export function updateLoadingProgress(percentage: number): void {
    const loaderFill = document.querySelector('#loadingScreen .loader-fill') as HTMLDivElement | null;
    if (loaderFill) {
      loaderFill.style.width = `${percentage}%`;
    }

    const loadingText = document.querySelector('#loadingScreen .loading-container p');
    if (loadingText) {
        if (percentage >= 100) {
            loadingText.textContent = 'READY!';
        } else {
            loadingText.textContent = `LOADING... ${Math.round(percentage)}%`;
        }
    }
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