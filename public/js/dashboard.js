document.addEventListener("DOMContentLoaded", function () {
  const userInfoDiv = document.getElementById("user-info");
  const token = localStorage.getItem("accessToken");
  const paginationDiv = document.getElementById("pagination");
  const booksListDiv = document.getElementById("books-list");
  const loansListDiv = document.getElementById("loans-list");
  const addBookBtn = document.getElementById("addBookBtn");
  const addBookModal = document.getElementById("addBookModal");
  const closeModalBtn = document.querySelector(".close");

  let currentPage = 1;
  const itemsPerPage = 3;

  // Funkcja do dekodowania tokena JWT
  function parseJwt(token) {
    const base64Payload = token.split(".")[1];
    const payload = atob(base64Payload);
    return JSON.parse(payload);
  }

  // Zamknij modal przy kliknięciu przycisku (x)
  closeModalBtn.addEventListener("click", function () {
    addBookModal.style.display = "none";
  });

  // Zamknij modal przy kliknięciu poza modal (tło)
  window.onclick = function (event) {
    if (event.target == addBookModal) {
      addBookModal.style.display = "none";
    }
  };

  if (token) {
    const user = parseJwt(token);

    if (user) {
      userInfoDiv.innerHTML = `
                <p>Imię: <b>${user.imie}</b></p>
                <p>Nazwisko: <b>${user.nazwisko}</b></p>
                <p>Email: <b>${user.email}</b></p>
                <p>Rola: <b>${user.rola}</b></p>
            `;
    }

    function fetchBooks(page, title = '', author = '', category = '') {
      const offset = (page - 1) * itemsPerPage;
      const queryParams = new URLSearchParams({
        limit: itemsPerPage,
        offset: offset,
        title: title,
        author: author,
        category: category
    });
      fetch(`/api/books?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((response) => response.json())
        .then((data) => {
          const { books, totalItems } = data;
          booksListDiv.innerHTML = "";
          books.forEach((book) => {
            const bookElement = document.createElement("div");
            bookElement.className = "book";
            bookElement.innerHTML = `
                    <h3>Tytuł: ${book.tytul}</h3>
                    <p>Autorzy: ${book.autorzy}</p>
                    <p>Kategoria: ${book.nazwa}</p>
                    <p>Data Publikacji: ${book.data_publikacji}</p>
                    <p>Ilość Kopii: ${book.ilosc_kopii}</p>
                    <p>Opis: ${book.opis}</p>
                    `;
            booksListDiv.appendChild(bookElement);
          });
          setupPagination(totalItems, itemsPerPage, page);
        })
        .catch((error) => {
          console.error("Błąd przy pobieraniu książek:", error);
        });
    }

    function setupPagination(totalItems, itemsPerPage, currentPage) {
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      paginationDiv.innerHTML = "";
      for (let i = 1; i <= totalPages; i++) {
        const pageElement = document.createElement("button");
        pageElement.textContent = i;
        pageElement.className = currentPage === i ? "active" : "";
        pageElement.addEventListener("click", () => {
          fetchBooks(i);
        });
        paginationDiv.appendChild(pageElement);
      }
    }

    const searchBooksForm = document.getElementById("searchBooksForm");

    let firstStart = true;
    searchBooksForm.addEventListener("submit", (e) => {
        e.preventDefault(); 

        const searchTitle = document.getElementById("searchTitle").value;
        const searchAuthor = document.getElementById("searchAuthor").value;
        const searchCategory = document.getElementById("searchCategory").value;

        
        fetchBooks(1, searchTitle, searchAuthor, searchCategory);
        firstStart = false;
    });

    if(firstStart){
      fetchBooks(currentPage);
    }


    fetch("/api/loans/history", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => response.json())
      .then((loans) => {
        if (loans.length === 0) {
          loansListDiv.innerHTML = "<p>Brak wypożyczeń.</p>";
        } else {
          loans.forEach((loan) => {
            const loanElement = document.createElement("div");
            loanElement.className = "loan";
            loanElement.innerHTML = `
                        <h3>Wypożyczenie ID: ${loan.id}</h3>
                        <p>Użytkownik: ${loan.imie} ${loan.nazwisko} (Email: ${
              loan.email
            })</p>
                        <p>Książka: ${loan.tytul}</p>
                        <p>Data wypożyczenia: ${loan.data_wypozyczenia}</p>
                        <p>Planowana data zwrotu: ${
                          loan.planowana_data_zwrotu
                        }</p>
                        <p>Rzeczywista data zwrotu: ${
                          loan.rzeczywista_data_zwrotu
                            ? loan.rzeczywista_data_zwrotu
                            : '<span class="not-returned">Nie zwrócono jeszcze</span>'
                        }</p>
                    `;
            loansListDiv.appendChild(loanElement);
          });
        }
      })
      .catch((error) => {
        console.error("Błąd przy pobieraniu historii wypożyczeń:", error);
      });

    if (user && user.rola === "pracownik") {
      addBookBtn.style.display = "block";

      addBookBtn.addEventListener("click", function () {
        addBookModal.style.display = "block";
        console.log("Dodawanie książki..."); // Tymczasowy log

        // Pobierz listę autorów
        fetch("/api/authors")
          .then((response) => response.json())
          .then((authors) => {
            const authorSelect = document.getElementById("authorSelect");
            authors.forEach((author) => {
              const option = document.createElement("option");
              option.value = author.id;
              option.textContent = `${author.imie} ${author.nazwisko}`;
              authorSelect.appendChild(option);
            });
          });

        // Pobierz listę kategorii
        fetch("/api/categories")
          .then((response) => response.json())
          .then((categories) => {
            const categorySelect = document.getElementById("categorySelect");
            categories.forEach((category) => {
              const option = document.createElement("option");
              option.value = category.id;
              option.textContent = category.nazwa;
              categorySelect.appendChild(option);
            });
          });

        // Dodanie obsługi zdarzenia submit dla formularza dodawania książki
        const addBookForm = document.getElementById("addBookForm");
        addBookForm.addEventListener("submit", function (event) {
          event.preventDefault();

          const formData = {
            tytul: document.getElementById("title").value,
            id_autora: document.getElementById("authorSelect").value,
            nowyAutor: document.getElementById("newAuthor").value,
            id_kategorii: document.getElementById("categorySelect").value,
            data_publikacji: document.getElementById("publishDate").value,
            opis: document.getElementById("description").value,
            ilosc_kopii: document.getElementById("copyCount").value,
          };

          fetch("/api/books/new", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
            },
            body: JSON.stringify(formData),
          })
            .then((response) => {
              if (!response.ok) {
                throw new Error("Nie udało się dodać książki");
              }
              return response.json();
            })
            .then((data) => {
              console.log(data.message);
              addBookModal.style.display = "none";
            })
            .catch((error) => {
              console.error("Błąd:", error);
            });

          console.log("Formularz wysłany!");
        
          addBookModal.style.display = "none";
        });
      });
    }
  } else {
    userInfoDiv.innerHTML = "<p>Użytkownik niezalogowany.</p>";
  }
});
