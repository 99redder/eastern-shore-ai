// Website portfolio, shared by index.html and web-design.html.
// Add or edit projects in portfolioData; the project list buttons are built from it.
// Cloudflare caches .js for 4 hours: bump ?v= on both script tags after editing.
(function() {
  const list = document.getElementById('portfolio-list');
  const img = document.getElementById('portfolio-image');
  const imgLink = document.getElementById('portfolio-image-link');
  const points = document.getElementById('portfolio-points');
  const link = document.getElementById('portfolio-link');
  const prevBtn = document.getElementById('portfolio-prev');
  const nextBtn = document.getElementById('portfolio-next');
  const caption = document.getElementById('portfolio-caption');
  const dots = document.getElementById('portfolio-dots');
  if (!list || !img || !imgLink || !points || !link || !prevBtn || !nextBtn || !caption || !dots) return;
  let currentShots = [];
  let shotIndex = 0;

  const portfolioData = {
    stock: {
      name: 'Stock Stickies',
      shots: [
        { image: '/portfolio-stockstickies-notes.jpg', alt: 'Stock Stickies notes board screenshot', caption: 'Notes board' },
        { image: '/portfolio-stockstickies-portfolio.jpg', alt: 'Stock Stickies portfolio allocation chart screenshot', caption: 'Portfolio allocation' },
        { image: '/portfolio-stockstickies-dashboard.jpg', alt: 'Stock Stickies live market dashboard screenshot', caption: 'Live dashboard' }
      ],
      url: 'https://www.stockstickies.com',
      label: 'www.stockstickies.com',
      bullets: [
        'Fully customizable stock portfolio and notes web application.',
        'Utilizes finance APIs for real time market data.',
        'Portfolio tracking shows pie chart with your allocation and produces social media ready images.',
      ]
    },
    florence: {
      name: 'Florence Mae Gifts',
      shots: [
        { image: '/portfolio-florencemaegifts.png', alt: 'Florence Mae Gifts shop screenshot', caption: 'Shop' },
        { image: '/portfolio-florencemaegifts-listing.jpg', alt: 'Florence Mae Gifts product listing with Stripe checkout screenshot', caption: 'Product listing and checkout' },
        { image: '/portfolio-florencemaegifts-custom.jpg', alt: 'Florence Mae Gifts custom piece request form screenshot', caption: 'Custom piece request' }
      ],
      url: 'https://www.florencemaegifts.com',
      label: 'www.florencemaegifts.com',
      bullets: [
        'E-commerce shop utilizing secure Stripe payment processing.',
        'Over 20 unique items inventory managed through custom dashboard.',
        'Customers can request custom work directly from the site.',
        'Downloadable content automatically delivered to customers email after purchase.',
      ]
    },
    cbf: {
      name: 'CBF Church',
      shots: [
        { image: '/portfolio-cbfchurch.png', alt: 'CBF Church home page screenshot', caption: 'Home page' },
        { image: '/portfolio-cbfchurch-blog.jpg', alt: 'CBF Church blog archive screenshot', caption: 'Blog archive' },
        { image: '/portfolio-cbfchurch-donate.jpg', alt: 'CBF Church donation page screenshot', caption: 'Online donations' }
      ],
      url: 'https://www.cbfchurch.com',
      label: 'www.cbfchurch.com',
      bullets: [
        'Community church website with an admin mode that allows authorized users to post blog content and upload photos with zero code - replaced their existing Blogger setup.',
        'Automatically displays their newest YouTube videos and live streams.',
        'Custom-made contact system that allows visitors to email multiple church leaders straight from the site.',
        'Stripe powered donation workflow allows one time or periodic payments.'
      ]
    },
    bible: {
      name: 'Bible Reading Plan',
      shots: [
        { image: '/portfolio-bibleplannerapp-funfacts.jpg', alt: 'Bible Reading Plan daily reading with a "Did you know?" fun fact about Ecclesiastes 3 screenshot', caption: 'Daily reading with fun facts' },
        { image: '/portfolio-bibleplannerapp-changeplan.jpg', alt: 'Bible Reading Plan change plan screen with a live preview of the new schedule screenshot', caption: 'Change your plan anytime' },
        { image: '/portfolio-bibleplannerapp-install-v2.jpg', alt: 'Bible Reading Plan step-by-step install guide for iPhone screenshot', caption: 'Install on any phone' }
      ],
      url: 'https://biblereadingplan.app',
      label: 'biblereadingplan.app',
      bullets: [
        'Builds a fully personalized Bible reading plan: pick from 11 translations, any timeline from a few months to 10 years, and whether to read on weekends.',
        'Change your translation or timeline mid-plan without losing progress. The app re-plans what is left and previews your new daily pace and finish date.',
        'Optional "Did you know?" fun facts connect verses to the songs, films, art, and history they inspired, without interrupting your reading.',
        'Installs to the home screen of any phone with step-by-step instructions for your device, reads offline, and tracks streaks and progress.',
      ]
    },
    idesign: {
      name: 'iDesign Apparel Store',
      shots: [
        { image: '/portfolio-idesignas.png', alt: 'iDesign Apparel Store home page screenshot', caption: 'Home page' },
        { image: '/portfolio-idesignas-shop.jpg', alt: 'iDesign Apparel Store shop catalog screenshot', caption: 'Shop catalog' },
        { image: '/portfolio-idesignas-custom.jpg', alt: 'iDesign Apparel Store custom order form screenshot', caption: 'Custom orders' }
      ],
      url: 'https://www.idesignas.com',
      label: 'www.idesignas.com',
      bullets: [
        'Retro synthwave-styled storefront for print-on-demand apparel.',
        'Products are printed on order and shipped direct to customers in the USA and Canada.',
        'Shop by category with featured seasonal collections front and center.',
        'Custom design request workflow lets customers submit an idea, approve a mockup, and order even a single piece.',
      ]
    }
  };

  function showShot(index) {
    shotIndex = (index + currentShots.length) % currentShots.length;
    const shot = currentShots[shotIndex];
    img.src = shot.image;
    img.alt = shot.alt;
    caption.textContent = `${shot.caption} (${shotIndex + 1} of ${currentShots.length})`;
    dots.querySelectorAll('button').forEach((d, i) => d.classList.toggle('active', i === shotIndex));
  }

  function render(project) {
    const data = portfolioData[project];
    if (!data) return;
    currentShots = data.shots;
    dots.innerHTML = currentShots.map((s, i) => `<button type="button" aria-label="Show ${s.caption} screenshot" data-shot="${i}"></button>`).join('');
    showShot(0);
    imgLink.href = data.url;
    link.href = data.url;
    link.textContent = data.label;
    points.innerHTML = data.bullets.map(b => `<li>${b}</li>`).join('');
  }

  prevBtn.addEventListener('click', () => showShot(shotIndex - 1));
  nextBtn.addEventListener('click', () => showShot(shotIndex + 1));
  dots.addEventListener('click', e => {
    const dot = e.target.closest('button[data-shot]');
    if (dot) showShot(Number(dot.dataset.shot));
  });

  const keys = Object.keys(portfolioData);
  list.innerHTML = keys.map((key, i) =>
    `<button type="button" class="portfolio-item${i === 0 ? ' active' : ''}" data-project="${key}">${portfolioData[key].name}</button>`
  ).join('');
  const items = list.querySelectorAll('.portfolio-item');
  items.forEach(btn => {
    btn.addEventListener('click', () => {
      items.forEach(i => i.classList.remove('active'));
      btn.classList.add('active');
      render(btn.dataset.project);
    });
  });

  render(keys[0]);
})();
