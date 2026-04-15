/**
 * @file AddPrinterMenu.js
 * @description UI modal for choosing a printer variant to add to the farm.
 */
export class AddPrinterMenu {
  /**
   * @param {function(object)} onSelect Callback when a variant is chosen.
   */
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.container = null;
    this._setupUI();
  }

  _setupUI() {
    this.container = document.createElement('div');
    this.container.id = 'add-printer-menu';
    
    // Modern Glassmorphism Modal
    this.container.innerHTML = `
      <div class="menu-content">
        <h2>Add New Printer</h2>
        <p class="subtitle">Choose a unit type to deploy to your farm</p>
        
        <div class="variant-grid">
          <div class="variant-card" data-variant="standard">
            <div class="icon">🏭</div>
            <h3>Silver Edition</h3>
            <p>The reliable industrial standard for mass production.</p>
          </div>
          
          <div class="variant-card" data-variant="obsidian">
            <div class="icon">🕶️</div>
            <h3>Obsidian</h3>
            <p>Matte black stealth finish with reinforced components.</p>
          </div>
          
          <div class="variant-card" data-variant="gold">
            <div class="icon">👑</div>
            <h3>Executive Gold</h3>
            <p>Flagship unit with gold-plated accents and high precision.</p>
          </div>
        </div>
      </div>
    `;

    // Click behavior
    this.container.addEventListener('click', (e) => {
      // Close if clicking the backdrop
      if (e.target === this.container) {
        this.hide();
        return;
      }

      const card = e.target.closest('.variant-card');
      if (card) {
        const variant = card.dataset.variant;
        this.onSelect(this._getVariantConfig(variant));
        this.hide();
      }
    });

    document.body.appendChild(this.container);
  }

  show() {
    this.container.classList.add('visible');
  }

  hide() {
    this.container.classList.remove('visible');
  }

  _getVariantConfig(key) {
    const configMap = {
      standard: { name: 'Silver Edition', color: null, emissive: 0x000000 },
      obsidian: { name: 'Obsidian', color: 0x222222, emissive: 0x111111 },
      gold: { name: 'Executive Gold', color: 0xffbb33, emissive: 0x332200 }
    };
    return configMap[key];
  }
}
