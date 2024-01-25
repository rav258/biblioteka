const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const mysql = require("mysql2");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

// Konfiguracja połączenia z bazą danych
const pool = mysql.createPool({
    connectionLimit: 10, // maksymalna liczba połączeń
    host: "localhost",
    user: "root",
    password: "piko12",
    database: "biblioteka",
    charset: 'utf8mb4'
});

const SECRET_KEY = "DUPA"; // Używany do podpisania tokenów JWT

// Middleware do autoryzacji
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Endpoint logowania
app.post("/login", (req, res) => {
    const {email, password} = req.body;

    pool.query(
        "SELECT * FROM Uzytkownicy WHERE email = ?",
        [email],
        async (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }

            if (
                results.length === 0 ||
                !(await bcrypt.compare(password, results[0].haslo))
            ) {
                return res.status(401).json({message: "Niepoprawny email lub hasło"});
            }

            const user = {
                id: results[0].id,
                email: results[0].email,
                imie: results[0].imie,
                nazwisko: results[0].nazwisko,
                rola: results[0].rola,
            };
            const accessToken = jwt.sign(user, SECRET_KEY);
            res.json({accessToken});
        }
    );
});

// Pobieranie informacji o użytkowniku
app.get("/api/users/:userId", authenticateToken, (req, res) => {
    const userId = req.params.userId;

    pool.query(
        "SELECT id, imie, nazwisko, email, rola FROM Uzytkownicy WHERE id = ?",
        [userId],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            if (results.length > 0) {
                res.json(results[0]);
            } else {
                res.status(404).json({message: "Nie znaleziono użytkownika."});
            }
        }
    );
});

// Rejestracja użytkownika
app.post("/api/users/register", async (req, res) => {
    const {imie, nazwisko, email, password, rola} = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    pool.query(
        "INSERT INTO Uzytkownicy (imie, nazwisko, email, haslo, rola) VALUES (?, ?, ?, ?, ?)",
        [imie, nazwisko, email, hashedPassword, rola],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res.status(201).json({message: "Użytkownik zarejestrowany pomyślnie."});
        }
    );
});

//Pobieranie listy książek
app.get("/api/books", (req, res) => {
    const limit = parseInt(req.query.limit) || 3;
    const offset = parseInt(req.query.offset) || 0;

    pool.query(
        "SELECT COUNT(*) AS totalItems FROM Ksiazki",
        (error, countResults) => {
            if (error) {
                return res.status(500).json({error});
            }

            const totalItems = countResults[0].totalItems;

            pool.query(
                'SELECT Ksiazki.*, GROUP_CONCAT(Autorzy.imie, " ", Autorzy.nazwisko) AS autorzy FROM Ksiazki ' +
                "LEFT JOIN Autorzy_Ksiazki ON Ksiazki.id = Autorzy_Ksiazki.id_ksiazki " +
                "LEFT JOIN Autorzy ON Autorzy_Ksiazki.id_autora = Autorzy.id " +
                "GROUP BY Ksiazki.id " +
                "LIMIT ? OFFSET ?",
                [limit, offset],
                (error, results) => {
                    if (error) {
                        return res.status(500).json({error});
                    }
                    res.json({
                        books: results,
                        totalItems: totalItems,
                    });
                }
            );
        }
    );
});

//Pobieranie szczegółów książki
app.get("/api/books/:bookId", (req, res) => {
    const bookId = req.params.bookId;

    pool.query(
        "SELECT * FROM Ksiazki WHERE id = ?",
        [bookId],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            if (results.length > 0) {
                res.json(results[0]);
            } else {
                res.status(404).json({message: "Nie znaleziono książki."});
            }
        }
    );
});

//do sprawdzania roli pracownik
const requireRole = (role) => (req, res, next) => {
    if (req.user.rola !== role) {
        return res
            .status(403)
            .json({message: "Brak uprawnień do wykonania tej operacji."});
    }
    next();
};

//Dodawanie nowej książki
app.post(
    "/api/books/new",
    authenticateToken,
    requireRole("pracownik"),
    (req, res) => {
        const {tytul, data_publikacji, id_kategorii, opis, ilosc_kopii} =
            req.body;

        pool.query(
            "INSERT INTO Ksiazki (tytul, data_publikacji, id_kategorii, opis, ilosc_kopii) VALUES (?, ?, ?, ?, ?)",
            [tytul, data_publikacji, id_kategorii, opis, ilosc_kopii],
            (error, results) => {
                if (error) {
                    return res.status(500).json({error});
                }
                res
                    .status(201)
                    .json({
                        message: "Książka dodana pomyślnie.",
                        bookId: results.insertId,
                    });
            }
        );
    }
);

//Usuwanie książki
app.delete(
    "/api/books/:bookId",
    authenticateToken,
    requireRole("pracownik"),
    (req, res) => {
        const bookId = req.params.bookId;

        pool.query(
            "DELETE FROM Ksiazki WHERE id = ?",
            [bookId],
            (error, results) => {
                if (error) {
                    return res.status(500).json({error});
                }
                if (results.affectedRows > 0) {
                    res.json({message: "Książka usunięta pomyślnie."});
                } else {
                    res.status(404).json({message: "Nie znaleziono książki."});
                }
            }
        );
    }
);

//Wypożyczenie książki
app.post("/api/loans", authenticateToken, (req, res) => {
    const {
        id_uzytkownika,
        id_ksiazki,
        data_wypozyczenia,
        planowana_data_zwrotu,
    } = req.body;

    pool.query(
        "INSERT INTO Wypozyczenia (id_uzytkownika, id_ksiazki, data_wypozyczenia, planowana_data_zwrotu) VALUES (?, ?, ?, ?)",
        [id_uzytkownika, id_ksiazki, data_wypozyczenia, planowana_data_zwrotu],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res
                .status(201)
                .json({
                    message: "Wypożyczenie zarejestrowane pomyślnie.",
                    loanId: results.insertId,
                });
        }
    );
});

//Zwrócenie książki
app.post("/api/loans/return/:loanId", authenticateToken, (req, res) => {
    const loanId = req.params.loanId;
    const {rzeczywista_data_zwrotu, uwagi} = req.body;

    // Najpierw aktualizujemy wypożyczenie
    pool.query(
        "UPDATE Wypozyczenia SET rzeczywista_data_zwrotu = ? WHERE id = ?",
        [rzeczywista_data_zwrotu, loanId],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            if (results.affectedRows === 0) {
                return res
                    .status(404)
                    .json({message: "Nie znaleziono wypożyczenia."});
            }

            // Następnie dodajemy wpis do historii wypożyczeń
            pool.query(
                "INSERT INTO Historia_Wypozyczen (id_wypozyczenia, rzeczywista_data_zwrotu, uwagi) VALUES (?, ?, ?)",
                [loanId, rzeczywista_data_zwrotu, uwagi],
                (error, results) => {
                    if (error) {
                        return res.status(500).json({error});
                    }
                    res.json({message: "Książka zwrócona pomyślnie."});
                }
            );
        }
    );
});

//Pobieranie historii wypożyczeń
app.get("/api/loans/history", authenticateToken, (req, res) => {
    const userId = req.user.id; // ID użytkownika z tokena JWT
    const userRole = req.user.rola; // Rola użytkownika z tokena JWT

    let query = "";
    let queryParams = [];

    if (userRole === 'pracownik') {
        // Jeśli użytkownik jest pracownikiem, zwróć wszystkie wypożyczenia
        query = `
            SELECT hw.*, w.*, u.imie, u.nazwisko, u.email, k.tytul
            FROM Historia_Wypozyczen hw
                     JOIN Wypozyczenia w ON hw.id_wypozyczenia = w.id
                     JOIN Uzytkownicy u ON w.id_uzytkownika = u.id
                     JOIN Ksiazki k ON w.id_ksiazki = k.id
        `;
    } else {
        // Jeśli użytkownik nie jest pracownikiem, zwróć tylko jego wypożyczenia
        query = `
            SELECT hw.*, w.*, u.imie, u.nazwisko, u.email, k.tytul
            FROM Historia_Wypozyczen hw
                     JOIN Wypozyczenia w ON hw.id_wypozyczenia = w.id
                     JOIN Uzytkownicy u ON w.id_uzytkownika = u.id
                     JOIN Ksiazki k ON w.id_ksiazki = k.id
            WHERE w.id_uzytkownika = ?
        `;
        queryParams = [userId];
    }

    pool.query(query, queryParams, (error, results) => {
        if (error) {
            return res.status(500).json({error});
        }
        res.json(results);
    });
});


//Rezerwowanie książki
app.post("/api/reservations", authenticateToken, (req, res) => {
    const {id_uzytkownika, id_ksiazki, data_rezerwacji} = req.body;

    pool.query(
        'INSERT INTO Rezerwacje (id_uzytkownika, id_ksiazki, data_rezerwacji, status) VALUES (?, ?, ?, "oczekująca")',
        [id_uzytkownika, id_ksiazki, data_rezerwacji],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res
                .status(201)
                .json({
                    message: "Rezerwacja zarejestrowana pomyślnie.",
                    reservationId: results.insertId,
                });
        }
    );
});

//Anulowanie rezerwacji
app.delete(
    "/api/reservations/:reservationId",
    authenticateToken,
    (req, res) => {
        const reservationId = req.params.reservationId;

        pool.query(
            "DELETE FROM Rezerwacje WHERE id = ?",
            [reservationId],
            (error, results) => {
                if (error) {
                    return res.status(500).json({error});
                }
                if (results.affectedRows > 0) {
                    res.json({message: "Rezerwacja anulowana pomyślnie."});
                } else {
                    res.status(404).json({message: "Nie znaleziono rezerwacji."});
                }
            }
        );
    }
);

//Dodawanie opinii o książce
app.post("/api/books/:bookId/reviews", authenticateToken, (req, res) => {
    const bookId = req.params.bookId;
    const {id_uzytkownika, ocena, tekst_opinii, data_opinii} = req.body;

    pool.query(
        "INSERT INTO Opinie_o_Ksiazkach (id_ksiazki, id_uzytkownika, ocena, tekst_opinii, data_opinii) VALUES (?, ?, ?, ?, ?)",
        [bookId, id_uzytkownika, ocena, tekst_opinii, data_opinii],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res
                .status(201)
                .json({
                    message: "Opinia dodana pomyślnie.",
                    reviewId: results.insertId,
                });
        }
    );
});

//Pobieranie opinii o książce
app.get("/api/books/:bookId/reviews", (req, res) => {
    const bookId = req.params.bookId;

    pool.query(
        "SELECT * FROM Opinie_o_Ksiazkach WHERE id_ksiazki = ?",
        [bookId],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res.json(results);
        }
    );
});

//Pobieranie kar użytkownika
app.get("/api/users/:userId/fines", authenticateToken, (req, res) => {
    const userId = req.params.userId;

    pool.query(
        "SELECT * FROM Kary WHERE id_uzytkownika = ?",
        [userId],
        (error, results) => {
            if (error) {
                return res.status(500).json({error});
            }
            res.json(results);
        }
    );
});

//Opłacanie kary
app.post(
    "/api/users/:userId/fines/:fineId/pay",
    authenticateToken,
    (req, res) => {
        const fineId = req.params.fineId;

        pool.query(
            'UPDATE Kary SET status = "zapłacona" WHERE id = ?',
            [fineId],
            (error, results) => {
                if (error) {
                    return res.status(500).json({error});
                }
                if (results.affectedRows > 0) {
                    res.json({message: "Kara opłacona pomyślnie."});
                } else {
                    res.status(404).json({message: "Nie znaleziono kary."});
                }
            }
        );
    }
);


app.get('/api/authors', (req, res) => {
    pool.query('SELECT id, imie, nazwisko FROM Autorzy', (error, results) => {
        if (error) {
            return res.status(500).json({error});
        }
        res.json(results);
    });
});

app.get('/api/categories', (req, res) => {
    pool.query('SELECT id, nazwa FROM Kategorie', (error, results) => {
        if (error) {
            return res.status(500).json({error});
        }
        res.json(results);
    });
});


app.listen(port, () => {
    console.log(`Serwer działa na porcie ${port}`);
});
