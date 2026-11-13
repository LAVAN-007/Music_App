package com.lavu.musicsyncbackend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;       // lowercase key for lookups

    @Column(nullable = false)
    private String displayName;    // original casing for display

    @Column(nullable = false)
    private String passwordHash;   // BCrypt hashed
}
