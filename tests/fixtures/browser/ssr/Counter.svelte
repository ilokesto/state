<script>
  import { bindReadonly } from '../../../../dist/core/Svelte/index.js';
  let { store, selector } = $props();
  const selection = bindReadonly(store).select(selector);
</script>

<output>{$selection}</output>
