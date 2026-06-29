(function () {
    const STORAGE_KEY = 'singo-theme';
    const root = document.documentElement;

    function getInitialTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
        return 'light';
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);

        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            const isDark = theme === 'dark';
            toggle.setAttribute('aria-pressed', String(isDark));
            toggle.setAttribute('aria-label', isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro');
            toggle.title = isDark ? 'Tema chiaro' : 'Tema scuro';
            toggle.innerHTML = isDark ? '<span aria-hidden="true">☀</span>' : '<span aria-hidden="true">☾</span>';
        }
    }

    function createToggle() {
        if (document.getElementById('themeToggle')) return;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'themeToggle';
        toggle.className = 'theme-toggle';
        toggle.addEventListener('click', function () {
            const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
        });

        const navRight = document.querySelector('.navbar .nav-right');
        const navLinks = document.querySelector('.navbar .nav-links');
        const sidebar = document.querySelector('.sidebar');

        if (navRight) {
            navRight.insertBefore(toggle, navRight.firstChild);
        } else if (navLinks) {
            navLinks.insertBefore(toggle, navLinks.firstChild);
        } else if (sidebar) {
            sidebar.insertBefore(toggle, sidebar.firstChild.nextSibling);
        } else {
            document.body.insertBefore(toggle, document.body.firstChild);
        }

        applyTheme(root.getAttribute('data-theme') || getInitialTheme());
    }

    function enhancePasswordInputs() {
        document.querySelectorAll('input[type="password"]').forEach(function (input) {
            if (input.closest('.password-field')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'password-field';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'password-toggle';
            button.setAttribute('aria-label', 'Mostra password');
            button.title = 'Mostra password';
            button.innerHTML = '<span aria-hidden="true">👁</span>';

            button.addEventListener('click', function () {
                const isVisible = input.type === 'text';
                input.type = isVisible ? 'password' : 'text';
                button.setAttribute('aria-label', isVisible ? 'Mostra password' : 'Nascondi password');
                button.title = isVisible ? 'Mostra password' : 'Nascondi password';
                button.innerHTML = isVisible ? '<span aria-hidden="true">👁</span>' : '<span aria-hidden="true">✕</span>';
            });

            wrapper.appendChild(button);
        });
    }

    function createFooter() {
        if (document.querySelector('.footer')) return;

        const footer = document.createElement('footer');
        footer.className = document.body.classList.contains('manager-page') ? 'footer manager-footer' : 'footer';
        footer.innerHTML = [
            '<div class="footer-content">',
            '<div class="footer-links">',
            '<a href="privacy.html">Privacy Policy</a>',
            '<a href="termini.html">Termini e Condizioni</a>',
            '<a href="home.html">Home</a>',
            '</div>',
            '<div class="footer-copy">© 2026 SinGo - La Boutique della Spesa. Tutti i diritti riservati.</div>',
            '</div>'
        ].join('');

        const managerMain = document.querySelector('.manager-page .main');
        if (managerMain) {
            managerMain.appendChild(footer);
        } else {
            document.body.appendChild(footer);
        }
    }

    applyTheme(getInitialTheme());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            createToggle();
            enhancePasswordInputs();
            createFooter();
        });
    } else {
        createToggle();
        enhancePasswordInputs();
        createFooter();
    }
})();
