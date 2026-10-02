import UIKit
import UniformTypeIdentifiers

/**
 Pantry2Plate in the share sheet: a link shared from TikTok, Instagram, YouTube
 or Safari is sent to the app's server, which reads the recipe (a recipe page
 for anyone, a post's caption with AI for Pro) and saves it to the person's
 recipes, without leaving the app they were in.

 It signs in with the session the app shares through the App Group; without
 one it says to open the app first.
 */
final class ShareViewController: UIViewController {
    private static let group = "group.com.connordavidson.pantrytoplate"

    private let card = UIView()
    private let heading = UILabel()
    private let message = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let done = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        layout()
        Task { await save() }
    }

    private func layout() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        card.backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.09, alpha: 1)
        card.layer.cornerRadius = 22
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        heading.font = .systemFont(ofSize: 19, weight: .bold)
        heading.textColor = UIColor(red: 0.94, green: 0.91, blue: 0.87, alpha: 1)
        message.font = .systemFont(ofSize: 15)
        message.textColor = UIColor(red: 0.94, green: 0.91, blue: 0.87, alpha: 0.7)
        message.numberOfLines = 0
        spinner.color = UIColor(red: 0.95, green: 0.79, blue: 0.55, alpha: 1)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        done.backgroundColor = UIColor(red: 0.95, green: 0.93, blue: 0.89, alpha: 1)
        done.setTitleColor(UIColor(red: 0.08, green: 0.08, blue: 0.09, alpha: 1), for: .normal)
        done.layer.cornerRadius = 14
        done.heightAnchor.constraint(equalToConstant: 50).isActive = true
        done.addTarget(self, action: #selector(close), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [heading, message, spinner, done])
        stack.axis = .vertical
        stack.spacing = 12
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        NSLayoutConstraint.activate([
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            card.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 20),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20),
        ])
    }

    private func show(_ title: String, _ text: String, finished: Bool) {
        heading.text = title
        message.text = text
        spinner.isHidden = finished
        if finished { spinner.stopAnimating() } else { spinner.startAnimating() }
        done.isHidden = !finished
    }

    @objc private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// The link shared: a URL, or the first link in shared text (TikTok shares a sentence with the link in it).
    private func sharedURL() async -> URL? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                   url.scheme?.hasPrefix("http") == true {
                    return url
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                   let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
                   let url = Self.firstLink(in: text) {
                    return url
                }
            }
        }
        return nil
    }

    private static func firstLink(in text: String) -> URL? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        return detector?.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))?.url
    }

    private func save() async {
        show("Saving to Pantry2Plate", "Reading the recipe…", finished: false)
        guard let link = await sharedURL() else {
            show("Nothing to save", "Share a link to a recipe, or a TikTok, Instagram or YouTube post.", finished: true)
            return
        }
        let shared = UserDefaults(suiteName: Self.group)
        guard let token = shared?.string(forKey: "token"), let api = shared?.string(forKey: "apiUrl"), let endpoint = URL(string: "\(api)/api/recipes/import") else {
            show("Sign in first", "Open Pantry2Plate and sign in, then share the link again.", finished: true)
            return
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(TimeZone.current.identifier, forHTTPHeaderField: "X-Time-Zone")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["url": link.absoluteString])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if status == 201, let recipe = body?["recipe"] as? [String: Any] {
                show("Saved", "\(recipe["name"] as? String ?? "The recipe") is in your recipes.", finished: true)
            } else {
                show("Not saved", (body?["message"] as? String) ?? "That link couldn’t be read. Try another, or add it by hand.", finished: true)
            }
        } catch {
            show("Not saved", "Pantry2Plate couldn’t be reached. Check your connection and try again.", finished: true)
        }
    }
}
