<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import "bootstrap/dist/css/bootstrap.min.css";
	import "bootstrap-icons/font/bootstrap-icons.min.css";

	import Navbar from "$lib/components/Navbar.svelte"


	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Navbar />

<main class="content-area">
	{@render children()}
</main>

<style>
  .content-area {
    /* Platz für Sidebar auf Desktop */
    padding-bottom: 0;
  }

  @media (min-width: 768px) {
    .content-area {
      margin-left: 270px; /* Breite der Sidebar */
    }
  }

  @media (max-width: 767.98px) {
    .content-area {
      padding-bottom: 70px; /* Platz für Bottom-Nav, damit Inhalt nicht verdeckt wird */
    }
  }

</style>
