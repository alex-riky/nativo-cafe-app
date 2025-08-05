const staffMembers = [
  { name: "EDWIN", role: "Barista", image: "/img/aa.png", detailPage: "edwin.html" },
  { name: "EUNICES", role: "Cajera", image: "/img/aa.png", detailPage: "eunices.html" },
  { name: "GLENDA", role: "Supervisora", image: "/img/aa.png", detailPage: "glenda.html" },
  { name: "CHEF", role: "Chef Principal", image: "/img/aa.png", detailPage: "chef.html" },
  { name: "HERMANA DE CHEF", role: "Ayudante de Cocina", image: "/img/aa.png", detailPage: "hermana_chef.html" },
  { name: "RONALDO", role: "Mesero", image: "/img/aa.png", detailPage: "ronaldo.html" }
];

let currentIndex = 0;

function renderStaffCards() {
  const container = document.getElementById("staffContainer");
  container.classList.remove("fade-in");
  void container.offsetWidth; // Fuerza reflow para reiniciar animación
  container.classList.add("fade-in");

  container.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const index = (currentIndex + i) % staffMembers.length;
    const member = staffMembers[index];

    const card = document.createElement("div");
    card.classList.add("staff-card");

    card.innerHTML = `
      <a href="${member.detailPage}" class="staff-link">
        <img src="${member.image}" alt="Foto de ${member.name}" class="staff-img">
        <h3>${member.name}</h3>
        <p>${member.role}</p>
      </a>
    `;

    container.appendChild(card);
  }
}

function nextStaff() {
  currentIndex = (currentIndex + 3) % staffMembers.length;
  renderStaffCards();
}

function prevStaff() {
  currentIndex = (currentIndex - 3 + staffMembers.length) % staffMembers.length;
  renderStaffCards();
}

document.addEventListener("DOMContentLoaded", renderStaffCards);