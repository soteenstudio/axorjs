// @import Title from "../components/Title.jsx"
// @import Link from "../components/Link.jsx"
// @import Navigation from "../components/Navigation.jsx"
// @import Button from "../components/Button.jsx"

let count = 0;
function updateCount() {
  count++;
}

<div
  class="app-viewport"
  background-color="#0f0f11"
  height="100vh"
  display="flex"
  flex-direction="column"
  justify-content="center"
  align-items="center"
  margin="0"
>
  <h1
    color="#ffffff"
    font-family="system-ui, -apple-system, sans-serif"
    font-size="64px"
    font-weight="800"
    letter-spacing="-0.05em"
    margin="0"
  >
    Count: {count}
  </h1>
  <Button handle={updateCount} text="Add"></Button>
  <Navigation></Navigation>
</div>;
