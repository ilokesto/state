<script>
  export let binding;
  export let observe;
  $: observe($binding);
</script>

<output>{$binding.status === 'success' ? $binding.data : $binding.status}</output>
