export class NavigationHUD {
  /**
   * @param {number} totalBays Number of squares to generate
   * @param {number} cols Number of columns in the grid
   * @param {function(number)} onSelect Callback when a bay is clicked
   * @param {function(number, boolean)} onHover Callback when a bay is hovered
   * @param {function} onAdd Callback when the "+" button is clicked
   * @param {function} onOverview Callback when the overview button is clicked
   */
  constructor(totalBays, cols, onSelect, onHover, onAdd, onOverview) {
    this.totalBays = totalBays;
    this.cols = cols;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onAdd = onAdd;
    this.onOverview = onOverview;

    this.container = null;
    this.bayElements = [];

    this._setupUI();
  }

  _setupUI() {
    // Remove if already exists
    if (this.container) this.container.remove();

    this.container = document.createElement('div');
    this.container.id = 'navigation-hud';

    // Group 1: Utilities (Overview, Add)
    const utilGroup = document.createElement('div');
    utilGroup.className = 'hud-group';
    utilGroup.style.gridTemplateColumns = 'repeat(2, 1fr)';

    const overviewBtn = document.createElement('div');
    overviewBtn.className = 'hud-bay hud-util';
    overviewBtn.innerHTML = '🔲';
    overviewBtn.title = 'Farm Overview';
    overviewBtn.onclick = () => this.onOverview();
    utilGroup.appendChild(overviewBtn);

    const addBtn = document.createElement('div');
    addBtn.className = 'hud-bay hud-util';
    addBtn.innerHTML = '＋';
    addBtn.title = 'Add Printer';
    addBtn.onclick = () => this.onAdd();
    utilGroup.appendChild(addBtn);

    this.container.appendChild(utilGroup);

    // Group 2: Printer Bays
    const bayGroup = document.createElement('div');
    bayGroup.className = 'hud-group';
    bayGroup.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;

    this.bayElements = [];
    for (let i = 0; i < this.totalBays; i++) {
      const bay = document.createElement('div');
      bay.className = 'hud-bay';
      bay.innerHTML = `<span style="pointer-events: none;">${i + 1}</span>`;
      bay.dataset.id = i;

      bay.addEventListener('click', () => {
        this.onSelect(i);
      });

      bay.addEventListener('mouseenter', () => {
        if (this.onHover) this.onHover(i, true);
      });

      bay.addEventListener('mouseleave', () => {
        if (this.onHover) this.onHover(i, false);
      });

      bayGroup.appendChild(bay);
      this.bayElements.push(bay);
    }

    this.container.appendChild(bayGroup);
    document.body.appendChild(this.container);
  }

  /**
   * Rebuilds the HUD when the farm size changes.
   */
  refresh(newTotal) {
    this.totalBays = newTotal;
    this._setupUI();
  }

  /**
   * Updates the visual active state of the HUD elements.
   * @param {number|null} activeId 
   */
  updateSelection(activeId) {
    this.bayElements.forEach((el, i) => {
      if (i === activeId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  destroy() {
    if (this.container) {
      this.container.remove();
    }
    this.bayElements = [];
  }
}
