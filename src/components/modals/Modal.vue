<template>
  <transition name="modal-fade">
    <div class="modal-backdrop" @click="close">
      <div
        class="modal"
        :class="{ maximized: isMaximized }"
        role="dialog"
        aria-labelledby="modalTitle"
        aria-describedby="modalDescription"
        @click.stop=""
      >
        <div class="top-right-buttons">
          <font-awesome-icon
            @click="isMaximized = !isMaximized"
            class="top-right-button"
            :icon="['fas', isMaximized ? 'window-minimize' : 'window-maximize']"
          />
          <font-awesome-icon
            @click="close"
            class="top-right-button"
            icon="times-circle"
          />
        </div>
        <div class="slot">
          <slot></slot>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
export default {
  data: function () {
    return {
      isMaximized: false,
    };
  },
  methods: {
    close() {
      this.$emit("close");
    },
  },
};
</script>

<style lang="scss">
.modal-backdrop {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal {
  background: rgba(0, 0, 0, 0.8);
  padding: 10px 20px;
  border-radius: 10px;
  box-shadow: 2px 2px 20px 1px #000;
  display: flex;
  flex-direction: column;
  max-height: 80%;
  max-width: 80%;

  @media (orientation: portrait) {
    max-width: 90%;
    max-height: 100%;
  }

  .vote-history &,
  .night-reference &,
  .characters & {
    overflow-y: auto;
  }

  .role & {
    max-height: 100%;
  }

  .roles &,
  .characters & {
    max-height: 100%;
    max-width: 60%;

    @media (orientation: portrait) {
      max-width: 90%;
    }
  }

  ul {
    list-style-type: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    align-items: center;
    justify-content: center;
    line-height: 100%;
  }

  > .top-right-buttons {
    position: absolute;
    z-index: 100;
    top: 15px;
    right: 20px;
    > .top-right-button {
      cursor: pointer;
      width: 28px;
      &:hover {
        color: red;
      }
    }

    @media (orientation: portrait) {
      top: 15px;
      right: 5px;
      > .top-right-button {
        width: 25px;
        height: 15px;
      }
    }
  }

  > .slot {
    max-height: 100%;
    position: initial;

    @media (orientation: portrait) {
      ul.heading {
        grid-template-columns: min-content 1fr;
        justify-items: left;
      }
      h3 {
        text-align: left;
        text-wrap: wrap;
        padding-bottom: 5px;
        padding-right: 25px;
        font-size: 16px;
        line-height: 15px;
      }
    }
  }
}

.maximized {
  background: rgba(0, 0, 0, 0.95);
  padding: 0;
  border-radius: 0;
  height: 100%;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-content: center;
  justify-content: center;
  .roles &,
  .characters & {
    max-width: 100%;
    padding: 10px;
  }
  .role &,
  .roles & {
    overflow-y: auto;
    overflow-x: hidden;
  }
}

.modal-fade-enter,
.modal-fade-leave-active {
  opacity: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
</style>
