import SwiftUI

/// A simple card face: rank and suit symbol in the suit's color on a white card. Wizards and Jesters
/// have a tinted face and, unless small, their name, so a Jester never looks like a Jack.
struct CardView: View {
    let card: Card
    var isDimmed = false
    var isSelected = false
    var size: CGFloat = 1

    var body: some View {
        VStack(spacing: 0) {
            Text(card.rankText)
                .font(.system(size: 20 * size, weight: .bold, design: .rounded))
            if let suit = card.suit {
                Text(suit.symbol)
                    .font(.system(size: 20 * size))
            } else if size >= 1 {
                Text(card.accessibilityName.uppercased())
                    .font(.system(size: 8, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.top, 4)
                    .padding(.horizontal, 2)
            }
        }
        .foregroundStyle(card.color)
        .frame(width: 50 * size, height: 72 * size)
        .background(tint, in: RoundedRectangle(cornerRadius: 8 * size))
        .background(.white, in: RoundedRectangle(cornerRadius: 8 * size))
        .overlay {
            RoundedRectangle(cornerRadius: 8 * size)
                .strokeBorder(border, lineWidth: isSelected ? 3 : 1)
        }
        .opacity(isDimmed ? 0.35 : 1)
        .offset(y: isSelected ? -14 : 0)
        .animation(.default, value: isSelected)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityName)
    }

    private var tint: Color {
        card.isSpecial ? card.color.opacity(0.12) : .clear
    }

    private var border: Color {
        if isSelected { return .accentColor }
        return card.isSpecial ? card.color : Color.gray.opacity(0.5)
    }
}

#Preview {
    HStack {
        ForEach(["W1", "H14", "S10", "D2", "C12", "J1"], id: \.self) { code in
            CardView(card: Card(code: code)!)
        }
    }
    .padding()
    .background(.green.opacity(0.3))
}
