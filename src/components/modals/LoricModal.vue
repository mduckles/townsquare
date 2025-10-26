<template>
  <Modal v-if="modals.loric && fabled.length" @close="toggleModal('loric')">
    <h3>Choose a loric character to add to the game:</h3>
    <ul class="tokens">
      <li v-for="role in fabled" :key="role.id" @click="setLoric(role)">
        <Token :role="role" />
      </li>
    </ul>
  </Modal>
</template>

<script>
import { mapMutations, mapState } from "vuex";
import Modal from "./Modal";
import Token from "../Token";

export default {
  components: { Token, Modal },
  computed: {
    ...mapState(["modals", "fabled", "grimoire"]),
    fabled() {
      const fabled = [];
      this.$store.state.fabled.forEach((role) => {
        // don't show fabled that are already in play
        if (
          !this.$store.state.players.fabled.some(
            (fable) => fable.id === role.id,
          )
        ) {
          fabled.push(role);
        }
      });
      return fabled.filter(fabled => fabled.team === 'loric');
    },
  },
  methods: {
    setLoric(role) {
      this.$store.commit("players/setFabled", {
        fabled: role,
      });
      this.$store.commit("toggleModal", "loric");
    },
    ...mapMutations(["toggleModal"]),
  },
};
</script>

<style scoped lang="scss">
@import "../../vars.scss";

ul.tokens li {
  border-radius: 50%;
  width: 8vw;
  margin: 0.5%;
  transition: transform 500ms ease;

  @media (orientation: portrait) {
    width: 8vh;
  }

  &:hover {
    transform: scale(1.2);
    z-index: 10;
  }
}
</style>
