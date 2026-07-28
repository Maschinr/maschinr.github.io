<script>
    import { page } from '$app/stores';

    const items = [
        { href: '/devices', label: 'Geräte', icon: 'bi-boxes' },
        { href: '/persons', label: 'Personen', icon: 'bi-person' },
        { href: '/events', label: 'Veranstaltungen', icon: 'bi-calendar-event' },
        { href: '/due', label: 'Termine', icon: 'bi-list-task' },
        { href: '/settings', label: 'Einstellungen', icon: 'bi-gear' },
    ];

    let currentPath = $derived($page.url.pathname);
    
</script>

<!-- Desktop: Sidebar links -->
<nav class="d-none d-md-flex flex-column sidebar p-3">
    <a href="/" class="d-flex align-items-center mb-4 text-decoration-none">
        <span class="fs-4 fw-bold text-white">AgtScan2</span>
    </a>

    <ul class="nav nav-pills flex-column mb-auto">
        {#each items as item}
            <li class="nav-item mb-1">
                <a href={item.href} class="nav-link d-flex align-items-center gap-2 text-white" class:active={currentPath === item.href}>
                    <i class="bi {item.icon} fs-5"></i>
                    <span>{item.label}</span>
                </a>
            </li>
        {/each}
    </ul>
</nav>

<!-- Mobile: Bottom Tab Bar -->
<nav class="d-flex d-md-none bottom-nav fixed-bottom bg-dark">
    {#each items as item}
        <a href={item.href} class="bottom-nav-link flex-fill text-center py-2 text-decoration-none" class:active={currentPath === item.href}>
            <i class="bi {item.icon} d-block fs-5"></i>
            <small>{item.label}</small>
        </a>
    {/each}
</nav>

<style>
    .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 270px;
        background-color: #212529;
    }

    .sidebar .nav-link {
        opacity: 0.75;
        border-radius: 0.5rem;
        font-weight: 550;
        font-size: 0.95rem;
    }

    .sidebar .nav-link:hover, .sidebar .nav-link.active {
        opacity: 1;
        background-color: rgba(255, 255, 255, 0.15);
    }

    .bottom-nav {
        z-index: 1030;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: env(safe-area-inset-bottom); /* iPhone Home-Indicator */
    }

    .bottom-nav-link {
        color: rgba(255, 255, 255, 0.6);
    }

    .bottom-nav-link.active {
        color: #fff;
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 10px 18px;
    }
</style>