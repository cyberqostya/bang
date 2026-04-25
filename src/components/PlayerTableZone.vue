<script setup>
import { computed } from "vue";
import CharacterSlot from "./CharacterSlot.vue";
import PlayZone from "./PlayZone.vue";
import RoleCardButton from "./RoleCardButton.vue";
import WeaponSlot from "./WeaponSlot.vue";

const props = defineProps({
  attackRange: {
    type: Number,
    default: undefined,
  },
  canTakeWeapon: {
    type: Boolean,
    default: false,
  },
  character: {
    type: Object,
    default: undefined,
  },
  roleCanOpen: {
    type: Boolean,
    default: true,
  },
  roleFaceUp: {
    type: Boolean,
    default: undefined,
  },
  role: {
    type: Object,
    default: undefined,
  },
  weapon: {
    type: Object,
    default: undefined,
  },
});

const emit = defineEmits(["take-weapon"]);

const weaponSlotProps = computed(() => {
  if (props.weapon === undefined && props.attackRange === undefined) return {};

  return {
    attackRange: props.attackRange,
    canActivate: props.canTakeWeapon,
    weapon: props.weapon,
  };
});
</script>

<template>
  <PlayZone title="Планшет игрока" variant="table">
    <div class="table-main">
      <slot name="lead" />
      <div class="table-cards">
        <CharacterSlot :character="character" />
        <WeaponSlot
          v-bind="weaponSlotProps"
          @activate="emit('take-weapon', $event)"
        />
        <RoleCardButton
          :can-open="roleCanOpen"
          :is-face-up="roleFaceUp"
          :role="role"
        />
      </div>
    </div>
  </PlayZone>
</template>

<style scoped>
.table-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  padding: 15px 5px;
}

.table-cards {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}
</style>
