document.addEventListener('DOMContentLoaded', () => {
    
    // Feature Showcase Interactive Toggle
    const featureItems = document.querySelectorAll('.feature-item');
    const visualPlaceholder = document.getElementById('feature-1-img');
    
    const featureContent = {
        'feature-1': {
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
            caption: 'Live 3D Visualization'
        },
        'feature-2': {
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
            caption: 'AI Anomaly Detection'
        },
        'feature-3': {
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>`,
            caption: 'Web-Native Access'
        }
    };

    featureItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all
            featureItems.forEach(f => f.classList.remove('active'));
            
            // Add active class to clicked
            item.classList.add('active');
            
            // Update Visual with fade effect
            const target = item.getAttribute('data-target');
            const content = featureContent[target];
            
            visualPlaceholder.style.opacity = '0';
            visualPlaceholder.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
                visualPlaceholder.innerHTML = `
                    <div class="visual-icon">${content.icon}</div>
                    <span class="visual-caption">${content.caption}</span>
                `;
                visualPlaceholder.style.opacity = '1';
                visualPlaceholder.style.transform = 'translateY(0)';
            }, 300);
        });
    });

    // Simple scroll reveal for cards
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const cards = document.querySelectorAll('.glass-card');
    cards.forEach(card => {
        card.style.opacity = "0";
        card.style.transform = "translateY(20px)";
        card.style.transition = "opacity 0.6s ease-out, transform 0.6s ease-out, border-color 0.3s ease";
        observer.observe(card);
    });

});
